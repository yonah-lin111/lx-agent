import { mkdtempSync, readFileSync, rmSync } from "node:fs"
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
})
