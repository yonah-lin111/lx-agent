import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { killProcessTree } from "../jobs/jobRegistry"
import type { HookCommandOutput, HookCommandPayload, LoadedHook } from "./types"

// stdout/stderr 各自 1MB 硬顶。
const MAX_OUTPUT_BYTES = 1024 * 1024
// 超时 SIGTERM 后等待 SIGKILL 的宽限。
const KILL_GRACE_MS = 2000

export interface HookCommandInput {
  hook: LoadedHook
  payload: HookCommandPayload
  cwd: string
}

// 解析执行 shell 与最终命令（win32 优先 commandWindows）。
export const resolveHookShell = (
  hook: LoadedHook,
): { shell: string; args: string[]; command: string } => {
  if (process.platform === "win32") {
    return {
      shell: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c"],
      command: hook.commandWindows ?? hook.command,
    }
  }
  const shell = process.env.SHELL || (existsSync("/bin/bash") ? "/bin/bash" : "/bin/sh")
  return { shell, args: ["-lc"], command: hook.command }
}

// 注入给 hook 子进程的 LX_* 环境变量。
const buildHookEnv = (input: HookCommandInput): NodeJS.ProcessEnv => ({
  ...process.env,
  ...(input.payload.session_id ? { LX_SESSION_ID: input.payload.session_id } : {}),
  LX_HOOK_EVENT: input.payload.hook_event_name,
  LX_HOOK_NAME: input.hook.name,
  LX_CWD: input.cwd,
})

const emptyOutput = (startedAt: number): HookCommandOutput => ({
  exitCode: null,
  stdout: "",
  stderr: "",
  timedOut: false,
  spawnFailed: true,
  durationMs: Date.now() - startedAt,
  stdoutTruncated: false,
  stderrTruncated: false,
})

/**
 * 一次性子进程执行 hook：stdin 写 payload JSON 后立即关闭；输出捕获截断；超时杀进程树。
 * 不抛错（spawn 失败/超时归一为 timedOut/spawnFailed 结果）。
 */
export const runHookCommand = (input: HookCommandInput): Promise<HookCommandOutput> =>
  new Promise((resolve) => {
    const startedAt = Date.now()
    const { shell, args, command } = resolveHookShell(input.hook)

    let child: ReturnType<typeof spawn>
    try {
      child = spawn(shell, [...args, command], {
        cwd: input.cwd,
        env: buildHookEnv(input),
        detached: process.platform !== "win32",
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch {
      resolve(emptyOutput(startedAt))
      return
    }

    let stdout = ""
    let stderr = ""
    let stdoutTruncated = false
    let stderrTruncated = false

    const append = (chunk: Buffer, which: "stdout" | "stderr"): void => {
      const current = which === "stdout" ? stdout : stderr
      if (current.length >= MAX_OUTPUT_BYTES) {
        if (which === "stdout") stdoutTruncated = true
        else stderrTruncated = true
        return
      }
      const text = chunk.toString("utf8")
      const remaining = MAX_OUTPUT_BYTES - current.length
      if (text.length > remaining) {
        if (which === "stdout") {
          stdout += text.slice(0, remaining)
          stdoutTruncated = true
        } else {
          stderr += text.slice(0, remaining)
          stderrTruncated = true
        }
        return
      }
      if (which === "stdout") stdout += text
      else stderr += text
    }

    child.stdout?.on("data", (chunk: Buffer) => append(chunk, "stdout"))
    child.stderr?.on("data", (chunk: Buffer) => append(chunk, "stderr"))

    let settled = false
    let timedOut = false
    let hardKillTimer: NodeJS.Timeout | undefined

    const finish = (exitCode: number | null, spawnFailed: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (hardKillTimer) clearTimeout(hardKillTimer)
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut,
        spawnFailed,
        durationMs: Date.now() - startedAt,
        stdoutTruncated,
        stderrTruncated,
      })
    }

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      if (child.pid) killProcessTree(child.pid, "SIGTERM")
      hardKillTimer = setTimeout(() => {
        if (child.pid) killProcessTree(child.pid, "SIGKILL")
      }, KILL_GRACE_MS)
    }, input.hook.timeoutSec * 1000)

    child.on("error", () => finish(null, true))
    child.on("close", (code) => finish(code, false))

    if (child.stdin) {
      child.stdin.on("error", () => {
        // 子进程提前退出导致 EPIPE：忽略，由 close 事件收尾。
      })
      try {
        child.stdin.end(JSON.stringify(input.payload))
      } catch {
        // 写入失败：交给超时/close 收尾。
      }
    }
  })
