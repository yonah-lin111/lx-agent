import { spawn, spawnSync } from "node:child_process"
import { constants, existsSync } from "node:fs"
import { access } from "node:fs/promises"
import { z } from "zod"
import type { AgentTool } from "../core/types"
import { spillManager } from "../spill/spillManager"
import type { SessionDeps } from "./read"
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  type TruncationResult,
  truncateTail,
} from "./truncate"

// bash 默认超时（秒）。
const DEFAULT_TIMEOUT_SECONDS = 120
const MAX_TIMEOUT_MS = 2_147_483_647

const bashSchema = z.object({
  command: z.string().describe("要执行的 shell 命令"),
  timeout: z.number().describe("超时秒数（可选，默认 120 秒）").optional(),
})

export interface BashToolDetails {
  truncation?: TruncationResult
}

interface ShellConfig {
  shell: string
  args: string[]
  commandTransport?: "argv" | "stdin"
}

// Windows 上查找 bash.exe（Git Bash 常见路径 / PATH）。
const findBashOnPath = (): string | null => {
  try {
    const result = spawnSync("where", ["bash.exe"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    })
    if (result.status === 0 && result.stdout) {
      const firstMatch = result.stdout.trim().split(/\r?\n/)[0]
      if (firstMatch && existsSync(firstMatch)) return firstMatch
    }
  } catch {
    // 忽略错误
  }
  return null
}

// 按平台解析 shell 配置：Unix 优先 /bin/bash，Windows 用 Git Bash，最终回退 sh。
const getShellConfig = (): ShellConfig => {
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles
    const candidates: string[] = []
    if (programFiles) candidates.push(`${programFiles}\\Git\\bin\\bash.exe`)
    const programFilesX86 = process.env["ProgramFiles(x86)"]
    if (programFilesX86) candidates.push(`${programFilesX86}\\Git\\bin\\bash.exe`)
    for (const candidate of candidates) {
      if (existsSync(candidate)) return { shell: candidate, args: ["-c"] }
    }
    const bashOnPath = findBashOnPath()
    if (bashOnPath) return { shell: bashOnPath, args: ["-c"] }
    throw new Error("未找到 bash shell。请安装 Git for Windows 或将 bash 加入 PATH。")
  }

  if (existsSync("/bin/bash")) return { shell: "/bin/bash", args: ["-c"] }
  return { shell: "sh", args: ["-c"] }
}

// 终止进程树：Unix 按进程组负 pid，Windows 用 taskkill。
const killProcessTree = (pid: number): void => {
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true })
    } catch {
      // 忽略
    }
  } else {
    try {
      process.kill(-pid, "SIGTERM")
    } catch {
      try {
        process.kill(pid, "SIGTERM")
      } catch {
        // 进程可能已退出
      }
    }
  }
}

// 等待子进程结束并返回退出码（不因继承的 stdio 句柄挂起）。
const waitForChildProcess = (child: ReturnType<typeof spawn>): Promise<number | null> => {
  return new Promise((resolve) => {
    child.on("exit", (code) => resolve(code))
    child.on("error", () => resolve(null))
  })
}

// 创建 bash 工具：cwd 内执行命令，默认超时 + 进程树清理 + 尾部截断 + Spill 机制。
export const createBashTool = (
  cwd: string,
  sessionDeps?: SessionDeps,
): AgentTool<typeof bashSchema> => ({
  name: "bash",
  label: "执行命令",
  description: `在项目根目录执行 shell 命令，返回 stdout 与 stderr 合并输出。输出截断保留最后 ${DEFAULT_MAX_LINES} 行或 ${DEFAULT_MAX_BYTES / 1024}KB。可传 timeout 指定超时秒数。`,
  inputSchema: bashSchema,
  executionMode: "sequential",
  execute: async (toolCallId, params, signal) => {
    const shellConfig = getShellConfig()
    try {
      await access(cwd, constants.F_OK)
    } catch {
      return {
        content: [{ type: "text", text: `工作目录不存在: ${cwd}\n无法执行命令。` }],
        details: { error: "cwd_not_found" },
      }
    }

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
