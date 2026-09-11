import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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
