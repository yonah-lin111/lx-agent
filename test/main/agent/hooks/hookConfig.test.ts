import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
  }
})

import { hookConfig, loadHooks, parseHookConfig, parseMatcher } from "@/agent/hooks/hookConfig"

// 收集警告文本（避免污染测试输出）。
const collector = () => {
  const messages: string[] = []
  return { messages, warn: (message: string) => messages.push(message) }
}

let tmpDir = ""

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-hook-config-"))
  holder.configPath = join(tmpDir, "config.json")
  hookConfig.reset()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("parseHookConfig", () => {
  it("按配置顺序展开 LoadedHook[] 并解析 matcher 竖线精确列表", () => {
    const { messages, warn } = collector()
    const hooks = parseHookConfig(
      {
        PreToolUse: [
          {
            matcher: "bash|edit|write",
            hooks: [
              { name: "block-rm-rf", type: "command", command: "echo 1" },
              {
                command: "echo 2",
                timeout: 30,
                commandWindows: "powershell -File x.ps1",
                additionalContextLimit: 100,
              },
            ],
          },
          { hooks: [{ name: "all-tools", command: "echo 3" }] },
        ],
        UserPromptSubmit: [
          { matcher: "ignored-field", hooks: [{ name: "git-status", command: "git status" }] },
        ],
      },
      warn,
    )

    expect(messages).toEqual([])
    expect(hooks.map((hook) => hook.name)).toEqual([
      "block-rm-rf",
      "PreToolUse#2",
      "all-tools",
      "git-status",
    ])
    expect(hooks.map((hook) => hook.order)).toEqual([0, 1, 2, 3])
    expect(hooks[0]).toMatchObject({
      event: "PreToolUse",
      matcher: ["bash", "edit", "write"],
      command: "echo 1",
      timeoutSec: 600,
      additionalContextLimit: 2500,
    })
    expect(hooks[1]).toMatchObject({
      timeoutSec: 30,
      additionalContextLimit: 100,
      commandWindows: "powershell -File x.ps1",
    })
    // 缺省 matcher = 全部工具；非工具类事件忽略 matcher 字段。
    expect(hooks[2]?.matcher).toBeUndefined()
    expect(hooks[3]?.matcher).toBeUndefined()
  })

  it("未知事件键 / 非法结构 / 空命令 / 未知 handler 类型 → 告警 + 忽略且不抛出", () => {
    const { messages, warn } = collector()
    const hooks = parseHookConfig(
      {
        NotAnEvent: [{ hooks: [{ command: "x" }] }],
        PreToolUse: [
          "not-a-group",
          { matcher: 123, hooks: [{ command: "  " }] },
          { hooks: [] },
          { hooks: [{ type: "mcp_tool", command: "echo mcp" }] },
          { hooks: [{ type: "command", command: "" }] },
          { hooks: [{ command: "   " }] },
          { hooks: [{ command: "echo ok" }] },
        ],
      },
      warn,
    )

    expect(hooks.map((hook) => hook.command)).toEqual(["echo ok"])
    expect(messages.length).toBeGreaterThanOrEqual(7)
    expect(messages.some((message) => message.includes("未知事件键"))).toBe(true)
    expect(messages.some((message) => message.includes("matcher"))).toBe(true)
    expect(messages.some((message) => message.includes("无 hooks"))).toBe(true)
  })

  it("非对象根节点告警降级为空", () => {
    const { messages, warn } = collector()
    expect(parseHookConfig([], warn)).toEqual([])
    expect(parseHookConfig("x", warn)).toEqual([])
    expect(messages).toHaveLength(2)
  })

  it("parseMatcher 拆分/去空白；空值与非法类型按全部处理", () => {
    const { messages, warn } = collector()
    expect(parseMatcher("a| b |c", warn)).toEqual(["a", "b", "c"])
    expect(parseMatcher("", warn)).toBeUndefined()
    expect(parseMatcher(undefined, warn)).toBeUndefined()
    expect(parseMatcher(42, warn)).toBeUndefined()
    expect(messages).toHaveLength(1)
  })
})

describe("loadHooks", () => {
  it("读取 agent.hooks 节点", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({
        agent: { hooks: { Stop: [{ hooks: [{ name: "audit", command: "echo stop" }] }] } },
      }),
    )
    const { messages, warn } = collector()
    const hooks = loadHooks(holder.configPath, warn)
    expect(messages).toEqual([])
    expect(hooks).toHaveLength(1)
    expect(hooks[0]).toMatchObject({ name: "audit", event: "Stop", command: "echo stop" })
  })

  it("文件缺失 / 损坏 JSON / 根节点非对象 → 告警 + 空列表", () => {
    const { messages, warn } = collector()
    expect(loadHooks(join(tmpDir, "missing.json"), warn)).toEqual([])

    writeFileSync(holder.configPath, "{ broken")
    expect(loadHooks(holder.configPath, warn)).toEqual([])

    writeFileSync(holder.configPath, JSON.stringify(["array"]))
    expect(loadHooks(holder.configPath, warn)).toEqual([])

    expect(messages).toHaveLength(2)
  })
})

describe("hookConfig 会话级缓存", () => {
  it("同一作用域只加载一次；新作用域可见新配置；reset 后重载", () => {
    writeFileSync(
      holder.configPath,
      JSON.stringify({ agent: { hooks: { Stop: [{ hooks: [{ command: "echo v1" }] }] } } }),
    )
    expect(hookConfig.get("s1")[0]?.command).toBe("echo v1")

    writeFileSync(
      holder.configPath,
      JSON.stringify({ agent: { hooks: { Stop: [{ hooks: [{ command: "echo v2" }] }] } } }),
    )
    // 已有作用域缓存不变，新作用域读取新配置。
    expect(hookConfig.get("s1")[0]?.command).toBe("echo v1")
    expect(hookConfig.get("s2")[0]?.command).toBe("echo v2")

    hookConfig.reset("s1")
    expect(hookConfig.get("s1")[0]?.command).toBe("echo v2")
  })
})
