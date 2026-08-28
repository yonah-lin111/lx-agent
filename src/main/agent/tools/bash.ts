import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { jobRegistry } from "../jobs/jobRegistry"
import { persistentShellManager } from "../shell/persistentShell"
import { unifiedExecManager } from "../shell/unifiedExecManager"
import { spillManager } from "../spill/spillManager"
import type { SessionDeps } from "./read"
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type TruncationResult,
  truncateTail,
} from "./truncate"

// bash 默认超时（秒）。
const DEFAULT_TIMEOUT_SECONDS = 120
const MAX_TIMEOUT_MS = 2_147_483_647

const bashSchema = z.object({
  command: z.string().describe("Shell command to execute"),
  timeout: z
    .number()
    .describe("Timeout in seconds (optional, default 120 for synchronous execution)")
    .optional(),
  background: z
    .boolean()
    .describe(
      "Whether to start a long-running command in the background (e.g., dev servers, long builds, listener processes). When true, returns a job ID immediately without blocking.",
    )
    .optional(),
  session: z
    .string()
    .describe(
      "Persistent shell session name (optional). When specified, commands execute consecutively in a persistent terminal session, preserving environment variables and working directory state.",
    )
    .optional(),
})

export interface BashToolDetails {
  truncation?: TruncationResult
  backgroundJobId?: string
  session?: string
}

// 创建 bash 工具：cwd 内执行命令，默认超时 + 进程树清理 + 尾部截断 + Spill 机制 + 后台作业分支。
export const createBashTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof bashSchema> => ({
  name: "bash",
  label: "Execute command",
  description: `Execute a shell command in the project root directory, returning combined stdout and stderr output. Output is truncated to the last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB. Use timeout to specify a timeout in seconds, or background: true to run long-running commands in the background.`,
  inputSchema: bashSchema,
  executionMode: "sequential",
  execute: async (toolCallId, params, signal) => {
    try {
      await access(cwd, constants.F_OK)
    } catch {
      return {
        content: [
          { type: "text", text: `Working directory not found: ${cwd}\nCannot execute command.` },
        ],
        details: { error: "cwd_not_found" },
      }
    }

    const sessionId = sessionDeps?.getSessionId?.() ?? "default"

    // 互斥校验：background 与 session 不可同时使用
    if (params.background && params.session) {
      return {
        content: [
          {
            type: "text",
            text: "Invalid arguments: background and session are mutually exclusive, cannot start a background job in a persistent session.",
          },
        ],
        details: { error: "invalid_args" },
      }
    }

    // 后台长任务执行分支
    if (params.background) {
      try {
        const job = jobRegistry.startJob({
          kind: "bash",
          label: params.command,
          command: params.command,
          cwd,
          sessionId,
        })
        const notice = [
          `Background job ${job.id} (bash: ${job.label}) started with PID ${job.pid ?? "N/A"}.`,
          `Use 'job_output' with job_id='${job.id}' to inspect logs, or 'job_kill' to stop it.`,
        ].join("\n")
        return {
          content: [{ type: "text", text: notice }],
          details: { backgroundJobId: job.id },
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: "text", text: `Failed to start background job: ${errorMsg}` }],
          details: { error: errorMsg },
        }
      }
    }

    const timeoutSeconds = params.timeout ?? DEFAULT_TIMEOUT_SECONDS
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      return {
        content: [{ type: "text", text: "Invalid timeout: must be a positive number of seconds." }],
        details: { error: "invalid_timeout" },
      }
    }
    const timeoutMs = Math.min(timeoutSeconds * 1000, MAX_TIMEOUT_MS)

    if (signal?.aborted) {
      return { content: [{ type: "text", text: "Command aborted." }], details: { aborted: true } }
    }

    // 持久 Shell 执行分支
    if (params.session) {
      try {
        const session = persistentShellManager.getOrCreateSession(sessionId, params.session, cwd)
        const { output: rawOutput, exitCode } = await persistentShellManager.executeCommand(
          session,
          params.command,
          timeoutMs,
          signal,
        )

        const truncation = truncateTail(rawOutput)
        const { text, details } = formatOutput(rawOutput, truncation, { sessionId, toolCallId })
        const mergedDetails: BashToolDetails = {
          ...details,
          session: params.session,
        }

        if (exitCode !== 0) {
          return {
            content: [
              { type: "text", text: appendStatus(text, `Command exited with code ${exitCode}`) },
            ],
            details: mergedDetails,
          }
        }
        return { content: [{ type: "text", text }], details: mergedDetails }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: "text", text: `Persistent session execution failed: ${errorMsg}` }],
          details: { error: errorMsg, session: params.session },
        }
      }
    }

    const execRes = await unifiedExecManager.execCommand({
      command: params.command,
      cwd,
      sessionId,
      yieldTimeMs: timeoutMs,
      signal,
    })

    if (execRes.aborted || signal?.aborted) {
      return {
        content: [{ type: "text", text: appendStatus(execRes.output, "Command aborted") }],
        details: { aborted: true },
      }
    }

    if (execRes.isRunning) {
      unifiedExecManager.killProcess(execRes.processId)
      return {
        content: [
          {
            type: "text",
            text: appendStatus(execRes.output, `Command timed out after ${timeoutSeconds} seconds`),
          },
        ],
        details: { timedOut: true },
      }
    }

    const truncation = truncateTail(execRes.output)
    const activeSessionId = sessionDeps?.getSessionId?.() ?? undefined
    const { text, details } = formatOutput(execRes.output, truncation, {
      sessionId: activeSessionId,
      toolCallId,
    })

    if (execRes.exitCode !== 0 && execRes.exitCode !== null) {
      return {
        content: [
          {
            type: "text",
            text: appendStatus(text, `Command exited with code ${execRes.exitCode}`),
          },
        ],
        details,
      }
    }
    return { content: [{ type: "text", text }], details }
  },
})

const appendStatus = (text: string, status: string): string =>
  text ? `${text}\n\n${status}` : status

// 格式化尾部截断输出与提示。
const formatOutput = (
  rawOutput: string,
  truncation: TruncationResult,
  options?: { sessionId?: string; toolCallId?: string },
): { text: string; details?: BashToolDetails } => {
  let text = truncation.content || "(No output)"
  let details: BashToolDetails | undefined
  if (truncation.truncated) {
    details = { truncation }
    const { text: spilledText } = spillManager.handleTruncation(rawOutput, truncation, {
      sessionId: options?.sessionId,
      toolCallId: options?.toolCallId,
      customActionHint: "Use 'read' tool with offset/limit to view full bash log.",
    })
    text = spilledText
  }
  return { text, details }
}
