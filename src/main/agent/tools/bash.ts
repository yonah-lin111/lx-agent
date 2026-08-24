import { spawn } from "node:child_process"
import { constants } from "node:fs"
import { access } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { getShellConfig, jobRegistry, killProcessTree } from "../jobs/jobRegistry"
import { persistentShellManager } from "../shell/persistentShell"
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
  command: z.string().describe("要执行的 shell 命令"),
  timeout: z.number().describe("超时秒数（可选，同步执行时默认 120 秒）").optional(),
  background: z
    .boolean()
    .describe(
      "是否在后台启动长耗时命令（如开发服务器、长构建、监听进程）。为 true 时立即返回任务 ID，不阻塞主流程。",
    )
    .optional(),
  session: z
    .string()
    .describe("持久 shell 会话名称（可选）。指定后将在同名持久终端会话中连续执行，保持环境变量与工作目录状态。")
    .optional(),
})

export interface BashToolDetails {
  truncation?: TruncationResult
  backgroundJobId?: string
  session?: string
}

// 等待子进程结束并返回退出码（不因继承的 stdio 句柄挂起）。
const waitForChildProcess = (child: ReturnType<typeof spawn>): Promise<number | null> => {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code))
    child.on("error", () => resolve(null))
  })
}

// 创建 bash 工具：cwd 内执行命令，默认超时 + 进程树清理 + 尾部截断 + Spill 机制 + 后台作业分支。
export const createBashTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof bashSchema> => ({
  name: "bash",
  label: "执行命令",
  description: `在项目根目录执行 shell 命令，返回 stdout 与 stderr 合并输出。输出截断保留最后 ${DEFAULT_MAX_LINES} 行或 ${DEFAULT_MAX_BYTES / 1024}KB。可传 timeout 指定超时秒数，或传 background: true 在后台运行长耗时命令。`,
  inputSchema: bashSchema,
  executionMode: "sequential",
  execute: async (toolCallId, params, signal) => {
    try {
      await access(cwd, constants.F_OK)
    } catch {
      return {
        content: [{ type: "text", text: `工作目录不存在: ${cwd}\n无法执行命令。` }],
        details: { error: "cwd_not_found" },
      }
    }

    const sessionId = sessionDeps?.getSessionId?.() ?? "default"

    // 互斥校验：background 与 session 不可同时使用
    if (params.background && params.session) {
      return {
        content: [{ type: "text", text: "参数错误：background 与 session 互斥，不能在持久会话中启动后台作业。" }],
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
          content: [{ type: "text", text: `后台任务启动失败: ${errorMsg}` }],
          details: { error: errorMsg },
        }
      }
    }

    const shellConfig = getShellConfig()

    const timeoutSeconds = params.timeout ?? DEFAULT_TIMEOUT_SECONDS
    if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
      return {
        content: [{ type: "text", text: "无效的 timeout：必须是正数秒。" }],
        details: { error: "invalid_timeout" },
      }
    }
    const timeoutMs = Math.min(timeoutSeconds * 1000, MAX_TIMEOUT_MS)

    if (signal?.aborted) {
      return { content: [{ type: "text", text: "命令已中止。" }], details: { aborted: true } }
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
            content: [{ type: "text", text: appendStatus(text, `命令退出码 ${exitCode}`) }],
            details: mergedDetails,
          }
        }
        return { content: [{ type: "text", text }], details: mergedDetails }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: "text", text: `持久会话执行失败: ${errorMsg}` }],
          details: { error: errorMsg, session: params.session },
        }
      }
    }

    const child = spawn(
      shellConfig.shell,
      shellConfig.commandTransport === "stdin"
        ? shellConfig.args
        : [...shellConfig.args, params.command],
      {
        cwd,
        detached: process.platform !== "win32",
        stdio: [shellConfig.commandTransport === "stdin" ? "pipe" : "ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    )
    if (shellConfig.commandTransport === "stdin") {
      child.stdin?.on("error", () => {})
      child.stdin?.end(params.command)
    }

    const chunks: Buffer[] = []
    let outputBytes = 0
    let acceptingOutput = true
    const handleData = (data: Buffer): void => {
      if (!acceptingOutput) return
      chunks.push(data)
      outputBytes += data.length
      // 输出超过上限后停止累积，避免大输出占内存。
      if (outputBytes > DEFAULT_MAX_BYTES * 4) {
        acceptingOutput = false
      }
    }
    child.stdout?.on("data", handleData)
    child.stderr?.on("data", handleData)

    let timedOut = false
    let timeoutHandle: NodeJS.Timeout | undefined
    const onAbort = (): void => {
      if (child.pid) killProcessTree(child.pid)
    }

    try {
      if (timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true
          if (child.pid) killProcessTree(child.pid)
        }, timeoutMs)
      }
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true })
      }

      const exitCode = await waitForChildProcess(child)
      const rawOutput = Buffer.concat(chunks).toString("utf-8")

      if (signal?.aborted) {
        return {
          content: [{ type: "text", text: appendStatus(rawOutput, "命令已中止") }],
          details: { aborted: true },
        }
      }
      if (timedOut) {
        return {
          content: [
            { type: "text", text: appendStatus(rawOutput, `命令超过 ${timeoutSeconds} 秒超时`) },
          ],
          details: { timedOut: true },
        }
      }

      const truncation = truncateTail(rawOutput)
      const sessionId = sessionDeps?.getSessionId?.() ?? undefined
      const { text, details } = formatOutput(rawOutput, truncation, { sessionId, toolCallId })
      if (exitCode !== 0 && exitCode !== null) {
        return {
          content: [{ type: "text", text: appendStatus(text, `命令退出码 ${exitCode}`) }],
          details,
        }
      }
      return { content: [{ type: "text", text }], details }
    } finally {
      acceptingOutput = false
      if (timeoutHandle) clearTimeout(timeoutHandle)
      if (signal) signal.removeEventListener("abort", onAbort)
    }
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
  let text = truncation.content || "(无输出)"
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
