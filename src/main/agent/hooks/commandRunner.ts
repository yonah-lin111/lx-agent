import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { StringDecoder } from "node:string_decoder"
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
  // 取消通道：中止时杀子进程并立即返回 aborted 结果。
  signal?: AbortSignal
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
  aborted: false,
  durationMs: Date.now() - startedAt,
  stdoutTruncated: false,
  stderrTruncated: false,
})

const abortedOutput = (startedAt: number): HookCommandOutput => ({
  exitCode: null,
  stdout: "",
  stderr: "",
  timedOut: false,
  spawnFailed: false,
  aborted: true,
  durationMs: Date.now() - startedAt,
  stdoutTruncated: false,
  stderrTruncated: false,
})

// 截取不超过 maxBytes 的 UTF-8 前缀（回退到字符边界，不产生替换字符）。
const truncateToUtf8Bytes = (text: string, maxBytes: number): string => {
  const buffer = Buffer.from(text, "utf8")
  if (buffer.length <= maxBytes) return text
  let end = Math.max(0, maxBytes)
  while (end > 0 && ((buffer[end] ?? 0) & 0xc0) === 0x80) end -= 1
  return buffer.subarray(0, end).toString("utf8")
}

/**
 * 一次性子进程执行 hook：stdin 写 payload JSON 后立即关闭；输出捕获截断；超时/中止杀进程树。
 * 不抛错（spawn 失败/超时/中止归一为 timedOut/spawnFailed/aborted 结果）。
 */
export const runHookCommand = (input: HookCommandInput): Promise<HookCommandOutput> =>
  new Promise((resolve) => {
    const startedAt = Date.now()
    const { signal } = input
    if (signal?.aborted) {
      resolve(abortedOutput(startedAt))
      return
    }
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
    // decoder 缓存跨 chunk 拆分的多字节字符，避免产生替换字符 U+FFFD。
    const stdoutDecoder = new StringDecoder("utf8")
    const stderrDecoder = new StringDecoder("utf8")

    // 硬顶按 UTF-8 字节计（字符串 length 为 UTF-16 码元，会低估多字节输出）。
    const append = (chunk: Buffer, which: "stdout" | "stderr"): void => {
      const current = which === "stdout" ? stdout : stderr
      const currentBytes = Buffer.byteLength(current, "utf8")
      if (currentBytes >= MAX_OUTPUT_BYTES) {
        if (which === "stdout") stdoutTruncated = true
        else stderrTruncated = true
        return
      }
      const text = (which === "stdout" ? stdoutDecoder : stderrDecoder).write(chunk)
      const remaining = MAX_OUTPUT_BYTES - currentBytes
      if (Buffer.byteLength(text, "utf8") > remaining) {
        if (which === "stdout") {
          stdout += truncateToUtf8Bytes(text, remaining)
          stdoutTruncated = true
        } else {
          stderr += truncateToUtf8Bytes(text, remaining)
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
    let aborted = false
    let hardKillTimer: NodeJS.Timeout | undefined

    // SIGKILL 兜底：定时器不阻塞事件循环。
    const scheduleHardKill = (): void => {
      hardKillTimer = setTimeout(() => {
        if (child.pid) killProcessTree(child.pid, "SIGKILL")
      }, KILL_GRACE_MS)
      hardKillTimer.unref?.()
    }

    const finish = (exitCode: number | null, spawnFailed: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      if (hardKillTimer) clearTimeout(hardKillTimer)
      signal?.removeEventListener("abort", onAbort)
      resolve({
        exitCode,
        stdout,
        stderr,
        timedOut,
        spawnFailed,
        aborted,
        durationMs: Date.now() - startedAt,
        stdoutTruncated,
        stderrTruncated,
      })
    }

    // 中止：SIGTERM 进程树后立即返回（不等 close），SIGKILL 兜底清理。
    const onAbort = (): void => {
      if (settled) return
      aborted = true
      if (child.pid) killProcessTree(child.pid, "SIGTERM")
      finish(null, false)
      scheduleHardKill()
    }
    signal?.addEventListener("abort", onAbort, { once: true })

    const timeoutTimer = setTimeout(() => {
      timedOut = true
      if (child.pid) killProcessTree(child.pid, "SIGTERM")
      scheduleHardKill()
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
