import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return { ...actual, getConfigPath: () => holder.configPath }
})

import { getSubagentSettings, saveSubagentSettings } from "@/services/settingsService"

let tempDir = ""
let warnSpy: ReturnType<typeof vi.spyOn>

const writeConfig = (config: unknown): void => {
  writeFileSync(holder.configPath, JSON.stringify(config, null, 2))
}

const readConfig = (): Record<string, unknown> =>
  JSON.parse(readFileSync(holder.configPath, "utf8")) as Record<string, unknown>

const warnMessages = (): string[] => warnSpy.mock.calls.map((call) => String(call[0]))

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "subagent-settings-service-"))
  holder.configPath = join(tempDir, "config.json")
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
  rmSync(tempDir, { recursive: true, force: true })
})

describe("getSubagentSettings", () => {
  it("合法配置完整归一化：指令、模型、工具去重去空白、深度与并发、默认模型", () => {
    writeConfig({
      agent: {
        subagents: {
          roles: {
            "my-reviewer": {
              description: "  Strict review of a specific change set.  ",
              instructions: "You are a strict reviewer.",
              model: { provider: "openai", model: "gpt-5.1", variant: "high" },
              tools: ["read", " grep ", "read", "find"],
            },
          },
          maxDepth: 3,
          maxConcurrent: 4,
          defaultModel: { provider: "anthropic", model: "claude-sonnet-4-5" },
        },
      },
    })

    expect(getSubagentSettings()).toEqual({
      roles: {
        "my-reviewer": {
          description: "Strict review of a specific change set.",
          instructions: "You are a strict reviewer.",
          model: { provider: "openai", model: "gpt-5.1", variant: "high" },
          tools: ["read", "grep", "find"],
        },
      },
      maxDepth: 3,
      maxConcurrent: 4,
      defaultModel: { provider: "anthropic", model: "claude-sonnet-4-5" },
    })
  })

  it("缺失节点降级默认；无 roles 字段的裸角色表按角色映射解析", () => {
    writeConfig({ agent: {} })
    expect(getSubagentSettings()).toEqual({ roles: {}, maxDepth: 1 })

    writeConfig({ agent: { subagents: { "bare-role": { description: "Bare role" } } } })
    expect(getSubagentSettings()).toEqual({
      roles: { "bare-role": { description: "Bare role" } },
      maxDepth: 1,
    })
  })

  it("非法角色名/保留名/空 description/非对象条目告警并跳过，合法角色保留", () => {
    writeConfig({
      agent: {
        subagents: {
          roles: {
            Bad_Name: { description: "x" },
            review: { description: "x" },
            "empty-desc": { description: "   " },
            "not-object": "junk",
            keeper: { description: "keep" },
          },
        },
      },
    })

    expect(getSubagentSettings().roles).toEqual({ keeper: { description: "keep" } })
    expect(warnMessages().some((m) => m.startsWith("[subagents] "))).toBe(true)
    expect(warnMessages().some((m) => m.includes("忽略非法角色名: Bad_Name"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("保留角色名不可使用: review"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("角色 description 不能为空: empty-desc"))).toBe(
      true,
    )
    expect(warnMessages().some((m) => m.includes("忽略非法角色配置"))).toBe(true)
  })

  it("非法 instructions/tools/model 字段告警并丢弃，不影响角色其他字段；空工具表归一为缺省", () => {
    writeConfig({
      agent: {
        subagents: {
          roles: {
            "bad-fields": {
              description: "d",
              instructions: 42,
              tools: "read",
              model: { provider: "", model: "m" },
            },
            "string-model": { description: "d", model: "gpt-5" },
            "bad-tool-items": { description: "d", tools: ["read", "", 7, "read", " grep "] },
            "empty-tools": { description: "d", tools: [] },
          },
        },
      },
    })

    const settings = getSubagentSettings()
    expect(settings.roles["bad-fields"]).toEqual({ description: "d" })
    expect(settings.roles["string-model"]).toEqual({ description: "d" })
    expect(settings.roles["bad-tool-items"]).toEqual({ description: "d", tools: ["read", "grep"] })
    expect(settings.roles["empty-tools"]).toEqual({ description: "d" })
    expect(warnMessages().some((m) => m.includes("instructions 须为字符串"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("tools 须为字符串数组"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("model 非法"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("忽略非法工具名"))).toBe(true)
  })

  it("越界 maxDepth 回退 1、越界 maxConcurrent 丢弃，均告警；非对象节点降级默认", () => {
    writeConfig({ agent: { subagents: { roles: {}, maxDepth: 9, maxConcurrent: 0 } } })
    expect(getSubagentSettings()).toEqual({ roles: {}, maxDepth: 1 })

    writeConfig({ agent: { subagents: { roles: {}, maxDepth: 2.5, maxConcurrent: 33 } } })
    expect(getSubagentSettings()).toEqual({ roles: {}, maxDepth: 1 })

    writeConfig({ agent: { subagents: "bad" } })
    expect(getSubagentSettings()).toEqual({ roles: {}, maxDepth: 1 })

    expect(warnMessages().some((m) => m.includes("maxDepth"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("maxConcurrent"))).toBe(true)
    expect(warnMessages().some((m) => m.includes("必须是对象"))).toBe(true)
  })
})

describe("saveSubagentSettings", () => {
  it("整树覆盖 agent.subagents 并保留 ai、agent.hooks、agent.permissions 与其他顶层字段", () => {
    writeConfig({
      ai: { defaultModel: { provider: "p", model: "m" } },
      custom: { untouched: true },
      agent: {
        permissions: { defaultMode: "acceptEdits" },
        hooks: { Stop: [{ hooks: [{ name: "audit", command: "exit 0" }] }] },
        mcp: { servers: {} },
      },
    })

    const saved = saveSubagentSettings({
      roles: { "my-reviewer": { description: "Review", tools: ["read", "read", " grep "] } },
      maxDepth: 2,
      maxConcurrent: 4,
    })

    expect(saved).toEqual({
      roles: { "my-reviewer": { description: "Review", tools: ["read", "grep"] } },
      maxDepth: 2,
      maxConcurrent: 4,
    })

    const onDisk = readConfig()
    expect(onDisk.ai).toEqual({ defaultModel: { provider: "p", model: "m" } })
    expect(onDisk.custom).toEqual({ untouched: true })
    const agent = onDisk.agent as Record<string, unknown>
    expect(agent.permissions).toEqual({ defaultMode: "acceptEdits" })
    expect(agent.hooks).toEqual({ Stop: [{ hooks: [{ name: "audit", command: "exit 0" }] }] })
    expect(agent.mcp).toEqual({ servers: {} })
    expect(agent.subagents).toEqual(saved)
  })

  it("写盘后读回得到完全一致的规范化配置", () => {
    writeConfig({})

    const saved = saveSubagentSettings({
      roles: {
        "my-reviewer": {
          description: "Review",
          instructions: "Be strict.",
          model: { provider: "openai", model: "gpt-5.1", variant: "high" },
          tools: ["read", "grep"],
        },
      },
      maxDepth: 3,
      maxConcurrent: 2,
      defaultModel: { provider: "anthropic", model: "claude-sonnet-4-5" },
    })

    expect(getSubagentSettings()).toEqual(saved)
  })

  it("保留名/空 description/越界深度或并发均拒绝写入且文件不变", () => {
    writeConfig({ agent: { permissions: { defaultMode: "default" } } })
    const before = readFileSync(holder.configPath, "utf8")

    expect(() => saveSubagentSettings({ roles: { review: { description: "x" } } })).toThrow(
      "保留角色名不可使用: review",
    )
    expect(() =>
      saveSubagentSettings({ roles: { keeper: { description: "   " } }, maxDepth: 1 }),
    ).toThrow()
    expect(() =>
      saveSubagentSettings({ roles: { keeper: { description: "x" } }, maxDepth: 9 }),
    ).toThrow()
    expect(() =>
      saveSubagentSettings({
        roles: { keeper: { description: "x" } },
        maxDepth: 1,
        maxConcurrent: 33,
      }),
    ).toThrow()

    expect(readFileSync(holder.configPath, "utf8")).toBe(before)
  })
})
