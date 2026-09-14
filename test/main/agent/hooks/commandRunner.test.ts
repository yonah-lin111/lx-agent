import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resolveHookShell, runHookCommand } from "@/agent/hooks/commandRunner"
import type { HookCommandPayload, LoadedHook } from "@/agent/hooks/types"

const hook = (partial: Partial<LoadedHook> = {}): LoadedHook => ({
  name: "test-hook",
  event: "Stop",
  command: "true",
  timeoutSec: 30,
  additionalContextLimit: 2500,
  order: 0,
  ...partial,
})

const payload = (partial: Partial<HookCommandPayload> = {}): HookCommandPayload => ({
  cwd: "/tmp",
  hook_event_name: "Stop",
  ...partial,
})

let tmpDir = ""

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-hook-runner-"))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("runHookCommand", () => {
  it("stdin 写入 payload JSON 并注入 LX_* 环境变量", async () => {
    const result = await runHookCommand({
      hook: hook({
        name: "audit",
        command: 'echo "$LX_SESSION_ID|$LX_HOOK_EVENT|$LX_HOOK_NAME|$LX_CWD"',
      }),
      payload: payload({ session_id: "s1", hook_event_name: "Stop" }),
      cwd: tmpDir,
    })
    expect(result.spawnFailed).toBe(false)
    expect(result.stdout.trim()).toBe(`s1|Stop|audit|${tmpDir}`)
  })

  it("stdout 透传完整 stdin JSON（协议字段 snake_case）", async () => {
    const result = await runHookCommand({
      hook: hook({ command: "cat" }),
      payload: payload({ session_id: "s2", prompt: "hello" }),
      cwd: tmpDir,
    })
    const parsed = JSON.parse(result.stdout)
    expect(parsed).toMatchObject({
      session_id: "s2",
      hook_event_name: "Stop",
      prompt: "hello",
      cwd: "/tmp",
    })
  })

  it("超时杀进程树并标记 timedOut（fail-open）", async () => {
    const startedAt = Date.now()
    const result = await runHookCommand({
      hook: hook({ command: "sleep 30", timeoutSec: 1 }),
      payload: payload(),
      cwd: tmpDir,
    })
    expect(result.timedOut).toBe(true)
    expect(Date.now() - startedAt).toBeLessThan(10_000)
  })

  it("stdout 超过 1MB 截断标记", async () => {
    const result = await runHookCommand({
      hook: hook({ command: `node -e 'process.stdout.write("a".repeat(1200000))'` }),
      payload: payload(),
      cwd: tmpDir,
    })
    expect(result.stdout.length).toBe(1024 * 1024)
    expect(result.stdoutTruncated).toBe(true)
  })

  it("stdout 硬顶按 UTF-8 字节计（多字节字符不超限、不产生替换字符）", async () => {
    const result = await runHookCommand({
      hook: hook({ command: `node -e 'process.stdout.write("中".repeat(600000))'` }),
      payload: payload(),
      cwd: tmpDir,
    })
    const bytes = Buffer.byteLength(result.stdout, "utf8")
    expect(bytes).toBeLessThanOrEqual(1024 * 1024)
    expect(bytes).toBeGreaterThan(1024 * 1024 - 8)
    expect(result.stdoutTruncated).toBe(true)
    expect(result.stdout.includes("\uFFFD")).toBe(false)
  })

  it("signal abort 杀子进程并立即返回 aborted（不悬挂）", async () => {
    const pidFile = join(tmpDir, "hook.pid")
    const controller = new AbortController()
    const promise = runHookCommand({
      hook: hook({ command: `echo $$ > ${pidFile}; sleep 30`, timeoutSec: 60 }),
      payload: payload(),
      cwd: tmpDir,
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(existsSync(pidFile)).toBe(true))
    controller.abort()
    const startedAt = Date.now()
    const result = await promise
    expect(result.aborted).toBe(true)
    expect(result.stdout).toBe("")
    expect(Date.now() - startedAt).toBeLessThan(2000)
    const pid = Number(readFileSync(pidFile, "utf8").trim())
    await vi.waitFor(() => {
      expect(() => process.kill(pid, 0)).toThrow()
    })
  })

  it("signal 已中止 → 不启动子进程直接返回 aborted", async () => {
    const marker = join(tmpDir, "should-not-exist")
    const controller = new AbortController()
    controller.abort()
    const result = await runHookCommand({
      hook: hook({ command: `touch ${marker}` }),
      payload: payload(),
      cwd: tmpDir,
      signal: controller.signal,
    })
    expect(result.aborted).toBe(true)
    expect(result.spawnFailed).toBe(false)
    expect(existsSync(marker)).toBe(false)
  })

  it("无 signal 不产生 aborted（行为不变）", async () => {
    const result = await runHookCommand({
      hook: hook({ command: "echo ok" }),
      payload: payload(),
      cwd: tmpDir,
    })
    expect(result.aborted).toBe(false)
    expect(result.stdout.trim()).toBe("ok")
  })

  it("非零退出码透传", async () => {
    const result = await runHookCommand({
      hook: hook({ command: "exit 7" }),
      payload: payload(),
      cwd: tmpDir,
    })
    expect(result.exitCode).toBe(7)
  })

  it("shell 不存在 → spawnFailed 不抛错", async () => {
    const original = process.env.SHELL
    process.env.SHELL = "/nonexistent-lx-shell"
    try {
      const result = await runHookCommand({
        hook: hook({ command: "echo x" }),
        payload: payload(),
        cwd: tmpDir,
      })
      expect(result.spawnFailed).toBe(true)
    } finally {
      if (original === undefined) delete process.env.SHELL
      else process.env.SHELL = original
    }
  })
})

describe("resolveHookShell", () => {
  it("win32 优先 commandWindows，回退 command，走 cmd /d /s /c", () => {
    const descriptor = Object.getOwnPropertyDescriptor(process, "platform")
    Object.defineProperty(process, "platform", { value: "win32", configurable: true })
    try {
      expect(
        resolveHookShell(hook({ command: "posix", commandWindows: "powershell -File x.ps1" })),
      ).toMatchObject({
        args: ["/d", "/s", "/c"],
        command: "powershell -File x.ps1",
      })
      expect(resolveHookShell(hook({ command: "posix-only" }))).toMatchObject({
        args: ["/d", "/s", "/c"],
        command: "posix-only",
      })
    } finally {
      if (descriptor) Object.defineProperty(process, "platform", descriptor)
    }
  })

  it("POSIX 走 shell -lc", () => {
    const resolved = resolveHookShell(hook({ command: "echo hi" }))
    expect(resolved.args).toEqual(["-lc"])
    expect(resolved.command).toBe("echo hi")
  })
})
