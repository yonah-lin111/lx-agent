import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  dispatchHooks,
  firstBlock,
  firstPermissionDecision,
  firstStop,
  hookResultMessages,
} from "@/agent/hooks/dispatcher"
import type { LoadedHook } from "@/agent/hooks/types"

const hook = (partial: Partial<LoadedHook> = {}): LoadedHook => ({
  name: "hook",
  event: "Stop",
  command: "true",
  timeoutSec: 10,
  additionalContextLimit: 2500,
  order: 0,
  ...partial,
})

let tmpDir = ""

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-hook-dispatch-"))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("dispatchHooks", () => {
  it("配置顺序串行执行，每个 hook 一条结果", async () => {
    const orderFile = join(tmpDir, "order.txt")
    const hooks = [
      hook({ name: "first", order: 0, command: `echo 1 >> ${orderFile}` }),
      hook({ name: "second", order: 1, command: `echo 2 >> ${orderFile}` }),
      hook({ name: "other-event", event: "Stop", order: 2, command: "true" }),
    ]
    const result = await dispatchHooks(hooks, { event: "Stop", cwd: tmpDir })
    expect(result.runs.map((run) => run.hook.name)).toEqual(["first", "second", "other-event"])
    expect(readFileSync(orderFile, "utf8")).toBe("1\n2\n")
    expect(result.runs.every((run) => run.status === "completed")).toBe(true)
    expect(hookResultMessages(result)).toHaveLength(3)
  })

  it("matcher 精确过滤工具名（未命中不执行）", async () => {
    const hooks = [
      hook({
        name: "bash-only",
        event: "PreToolUse",
        matcher: ["bash"],
        command: `printf '%s' '{"hookSpecificOutput":{"additionalContext":"ran"}}'`,
      }),
    ]
    const skipped = await dispatchHooks(hooks, {
      event: "PreToolUse",
      cwd: tmpDir,
      toolName: "read",
    })
    expect(skipped.runs).toEqual([])

    const hit = await dispatchHooks(hooks, {
      event: "PreToolUse",
      cwd: tmpDir,
      toolName: "bash",
    })
    expect(hit.runs).toHaveLength(1)
    expect(hit.runs[0]?.message.text).toBe("ran")
  })

  it("block 取第一个成功阻断；failed 结果不覆盖成功结果", async () => {
    const hooks = [
      hook({
        name: "broken",
        event: "PreToolUse",
        order: 0,
        command: "exit 1",
      }),
      hook({
        name: "blocker-1",
        event: "PreToolUse",
        order: 1,
        command: "echo first >&2; exit 2",
      }),
      hook({
        name: "blocker-2",
        event: "PreToolUse",
        order: 2,
        command: "echo second >&2; exit 2",
      }),
    ]
    const result = await dispatchHooks(hooks, { event: "PreToolUse", cwd: tmpDir })
    expect(result.runs.map((run) => run.status)).toEqual(["failed", "blocked", "blocked"])
    expect(firstBlock(result)).toEqual({ reason: "first" })
    expect(result.runs[0]?.message.text).toBe("")
    expect(result.runs[0]?.block).toBeUndefined()
  })

  it("stop / permission 效果提取", async () => {
    const stopResult = await dispatchHooks(
      [
        hook({
          event: "UserPromptSubmit",
          command: `printf '%s' '{"continue":false,"stopReason":"maintenance"}'`,
        }),
      ],
      { event: "UserPromptSubmit", cwd: tmpDir },
    )
    expect(firstStop(stopResult)).toEqual({ reason: "maintenance" })

    const permissionResult = await dispatchHooks(
      [
        hook({
          event: "PermissionRequest",
          command: `printf '%s' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"no"}}}'`,
        }),
      ],
      { event: "PermissionRequest", cwd: tmpDir, toolName: "bash" },
    )
    expect(firstPermissionDecision(permissionResult)).toEqual({ decision: "deny", reason: "no" })
  })

  it("工具类事件 stdin 逐字段携带 tool_name/tool_input/tool_use_id（snake_case）", async () => {
    const evidence = join(tmpDir, "stdin.json")
    const result = await dispatchHooks(
      [
        hook({
          name: "wire",
          event: "PreToolUse",
          matcher: ["bash"],
          command: `cat > ${evidence}`,
        }),
      ],
      {
        event: "PreToolUse",
        sessionId: "s1",
        turnId: "turn-1",
        cwd: tmpDir,
        model: "m",
        permissionMode: "default",
        toolName: "bash",
        payload: {
          tool_input: { command: "ls -la" },
          tool_use_id: "call_1",
        },
      },
    )
    expect(result.runs).toHaveLength(1)
    const payload = JSON.parse(readFileSync(evidence, "utf8")) as Record<string, unknown>
    expect(payload).toMatchObject({
      session_id: "s1",
      turn_id: "turn-1",
      cwd: tmpDir,
      hook_event_name: "PreToolUse",
      model: "m",
      permission_mode: "default",
      tool_name: "bash",
      tool_input: { command: "ls -la" },
      tool_use_id: "call_1",
    })
  })

  it("子进程失败归一为 failed（不抛错）", async () => {
    const result = await dispatchHooks([hook({ command: "echo broken >&2; exit 9" })], {
      event: "Stop",
      cwd: tmpDir,
    })
    expect(result.runs[0]?.status).toBe("failed")
    expect(result.runs[0]?.message.text).toBe("broken")
  })

  it("additionalContextLimit 超限截断并附标记，未超限原样注入", async () => {
    const contextJson = (text: string): string =>
      `printf '%s' '${JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
      })}'`

    const within = await dispatchHooks(
      [
        hook({
          event: "SessionStart",
          additionalContextLimit: 100,
          command: contextJson("hello"),
        }),
      ],
      { event: "SessionStart", cwd: tmpDir },
    )
    expect(within.runs[0]?.additionalContext).toBe("hello")
    expect(within.runs[0]?.message.text).toBe("hello")

    // 5 token × 4 字符 = 20 字符上限，超出部分截断。
    const over = await dispatchHooks(
      [
        hook({
          event: "SessionStart",
          additionalContextLimit: 5,
          command: contextJson("x".repeat(50)),
        }),
      ],
      { event: "SessionStart", cwd: tmpDir },
    )
    const expected = `${"x".repeat(20)}\n\n[hook additional context truncated: exceeded 5 tokens]`
    expect(over.runs[0]?.additionalContext).toBe(expected)
    expect(over.runs[0]?.message.text).toBe(expected)
  })

  it("additionalContextLimit=0 禁用注入；其余审计文本回退（block reason 保留）", async () => {
    const contextJson = (text: string): string =>
      `printf '%s' '${JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: text },
      })}'`
    const disabled = await dispatchHooks(
      [
        hook({
          event: "PreToolUse",
          additionalContextLimit: 0,
          command: contextJson("ctx"),
        }),
      ],
      { event: "PreToolUse", cwd: tmpDir },
    )
    expect(disabled.runs[0]?.additionalContext).toBeUndefined()
    expect(disabled.runs[0]?.message.text).toBe("")

    const blockJson = `printf '%s' '${JSON.stringify({
      decision: "block",
      reason: "policy",
      hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: "ctx" },
    })}'`
    const blocked = await dispatchHooks(
      [hook({ event: "PreToolUse", additionalContextLimit: 0, command: blockJson })],
      { event: "PreToolUse", cwd: tmpDir },
    )
    expect(blocked.runs[0]?.additionalContext).toBeUndefined()
    expect(blocked.runs[0]?.message.text).toBe("policy")
    expect(firstBlock(blocked)).toEqual({ reason: "policy" })
  })

  it("signal 中止停止派发剩余 hook，在途 hook 归一为 failed", async () => {
    const marker = join(tmpDir, "second-ran")
    const controller = new AbortController()
    const startedAt = Date.now()
    const promise = dispatchHooks(
      [
        hook({ name: "slow", order: 0, command: "sleep 30", timeoutSec: 60 }),
        hook({ name: "after", order: 1, command: `touch ${marker}` }),
      ],
      { event: "Stop", cwd: tmpDir, signal: controller.signal },
    )
    setTimeout(() => controller.abort(), 100)
    const result = await promise
    expect(result.runs.map((run) => run.hook.name)).toEqual(["slow"])
    expect(result.runs[0]?.status).toBe("failed")
    expect(result.runs[0]?.message.text).toBe("")
    expect(existsSync(marker)).toBe(false)
    expect(Date.now() - startedAt).toBeLessThan(2000)
  })

  it("signal 已中止 → 一个 hook 都不派发", async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await dispatchHooks([hook({ command: "sleep 30" })], {
      event: "Stop",
      cwd: tmpDir,
      signal: controller.signal,
    })
    expect(result.runs).toEqual([])
  })
})
