import type { HookEventName } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { parseHookOutput } from "@/agent/hooks/outputParser"
import type { HookCommandOutput } from "@/agent/hooks/types"

// 构造执行输出（默认成功空输出）。
const output = (partial: Partial<HookCommandOutput>): HookCommandOutput => ({
  exitCode: 0,
  stdout: "",
  stderr: "",
  timedOut: false,
  spawnFailed: false,
  durationMs: 5,
  stdoutTruncated: false,
  stderrTruncated: false,
  ...partial,
})

describe("parseHookOutput", () => {
  it("空输出 exit 0 → completed 无文本", () => {
    expect(parseHookOutput("Stop", output({}))).toEqual({ status: "completed", text: "" })
  })

  it("合法 JSON additionalContext → completed 注入", () => {
    const parsed = parseHookOutput(
      "UserPromptSubmit",
      output({
        stdout: JSON.stringify({
          hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "  extra  " },
        }),
      }),
    )
    expect(parsed.status).toBe("completed")
    expect(parsed.additionalContext).toBe("extra")
    expect(parsed.text).toBe("extra")
  })

  it("纯文本输出忽略（不失败、不注入）", () => {
    expect(parseHookOutput("Stop", output({ stdout: "hello world" }))).toEqual({
      status: "completed",
      text: "",
    })
  })

  it("`{` 开头但解析失败 → failed", () => {
    expect(parseHookOutput("Stop", output({ stdout: "{ broken json" })).status).toBe("failed")
  })

  it("非零退出（非 PreToolUse exit 2）→ failed + stderr", () => {
    const parsed = parseHookOutput("Stop", output({ exitCode: 3, stderr: "boom" }))
    expect(parsed.status).toBe("failed")
    expect(parsed.text).toBe("boom")
  })

  it("PreToolUse exit 2 + stderr → blocked（原因来自 stderr）", () => {
    const parsed = parseHookOutput(
      "PreToolUse",
      output({ exitCode: 2, stderr: "rm -rf is forbidden\n" }),
    )
    expect(parsed.status).toBe("blocked")
    expect(parsed.block).toEqual({ reason: "rm -rf is forbidden" })
    expect(parsed.text).toBe("rm -rf is forbidden")
  })

  it("PreToolUse exit 2 无 stderr → blocked 默认原因", () => {
    const parsed = parseHookOutput("PreToolUse", output({ exitCode: 2 }))
    expect(parsed.block).toEqual({ reason: "Blocked by hook" })
  })

  it("PreToolUse decision:block → blocked", () => {
    const parsed = parseHookOutput(
      "PreToolUse",
      output({ stdout: JSON.stringify({ decision: "block", reason: "policy" }) }),
    )
    expect(parsed.status).toBe("blocked")
    expect(parsed.block).toEqual({ reason: "policy" })
  })

  it("PreToolUse decision 非法值 → failed", () => {
    const parsed = parseHookOutput(
      "PreToolUse",
      output({ stdout: JSON.stringify({ decision: "nope" }) }),
    )
    expect(parsed.status).toBe("failed")
  })

  it("UserPromptSubmit continue:false → stop + stopReason", () => {
    const parsed = parseHookOutput(
      "UserPromptSubmit",
      output({ stdout: JSON.stringify({ continue: false, stopReason: "maintenance" }) }),
    )
    expect(parsed.status).toBe("completed")
    expect(parsed.stop).toEqual({ reason: "maintenance" })
    expect(parsed.text).toBe("maintenance")
  })

  it("其余事件 continue:false 降级为 systemMessage 警告（不中断）", () => {
    const parsed = parseHookOutput(
      "Stop",
      output({ stdout: JSON.stringify({ continue: false, stopReason: "nope" }) }),
    )
    expect(parsed.stop).toBeUndefined()
    expect(parsed.text).toContain("Hook requested stop")
  })

  it("PermissionRequest decision.allow/deny 生效并携带 message", () => {
    const allow = parseHookOutput(
      "PermissionRequest",
      output({
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: { behavior: "allow" },
          },
        }),
      }),
    )
    expect(allow.permission).toEqual({ decision: "allow" })

    const deny = parseHookOutput(
      "PermissionRequest",
      output({
        stdout: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PermissionRequest",
            decision: { behavior: "deny", message: "denied by policy" },
          },
        }),
      }),
    )
    expect(deny.permission).toEqual({ decision: "deny", reason: "denied by policy" })
    expect(deny.text).toBe("denied by policy")
  })

  it("PermissionRequest 非法 behavior → failed", () => {
    const parsed = parseHookOutput(
      "PermissionRequest",
      output({
        stdout: JSON.stringify({ hookSpecificOutput: { decision: { behavior: "maybe" } } }),
      }),
    )
    expect(parsed.status).toBe("failed")
  })

  it("预留 updatedInput 出现 → failed", () => {
    const parsed = parseHookOutput(
      "PreToolUse",
      output({
        stdout: JSON.stringify({
          hookSpecificOutput: { hookEventName: "PreToolUse", updatedInput: { command: "ls" } },
        }),
      }),
    )
    expect(parsed.status).toBe("failed")
  })

  it("已知字段类型非法 → failed", () => {
    expect(
      parseHookOutput("Stop", output({ stdout: JSON.stringify({ systemMessage: 42 }) })).status,
    ).toBe("failed")
    expect(
      parseHookOutput("Stop", output({ stdout: JSON.stringify({ continue: "yes" }) })).status,
    ).toBe("failed")
  })

  it("systemMessage 记录为审计文本", () => {
    const parsed = parseHookOutput(
      "PostCompact",
      output({ stdout: JSON.stringify({ systemMessage: "compacted" }) }),
    )
    expect(parsed.text).toBe("compacted")
    expect(parsed.systemMessage).toBe("compacted")
  })

  it("超时 / spawn 失败 → failed", () => {
    expect(parseHookOutput("Stop", output({ timedOut: true })).status).toBe("failed")
    expect(parseHookOutput("Stop", output({ spawnFailed: true, exitCode: null })).status).toBe(
      "failed",
    )
  })

  it("所有事件名解析不抛错", () => {
    const events: HookEventName[] = [
      "PreToolUse",
      "PermissionRequest",
      "PostToolUse",
      "PreCompact",
      "PostCompact",
      "SessionStart",
      "SessionEnd",
      "UserPromptSubmit",
      "SubagentStart",
      "SubagentStop",
      "Stop",
    ]
    for (const event of events) {
      expect(parseHookOutput(event, output({})).status).toBe("completed")
    }
  })
})
