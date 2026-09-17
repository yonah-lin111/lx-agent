import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ALL_CLI_IDS, DEFAULT_LSP_SETTINGS, DEFAULT_VOICE_SETTINGS } from "@shared/settings"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "", appDataRoot: "" }))
const trashItem = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("electron", () => ({ shell: { trashItem } }))
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
    getAppDataRoot: () => holder.appDataRoot,
  }
})

import {
  deleteSkill,
  getCliSettings,
  getLspSettings,
  getMcpSettings,
  getUiSettings,
  getVoiceSettings,
  normalizeSkillSettings,
  normalizeVoiceSettings,
  saveCliSettings,
  saveLspSettings,
  saveMcpSettings,
  saveModelProviderSettings,
  saveSkillSettings,
  saveUiSettings,
  saveVoiceSettings,
} from "@/services/settingsService"

let tmpDir: string

const readConfig = (): Record<string, unknown> =>
  JSON.parse(readFileSync(holder.configPath, "utf8")) as Record<string, unknown>

const writeConfig = (config: unknown): void => {
  writeFileSync(holder.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-settings-behavior-"))
  holder.configPath = join(tmpDir, "config.json")
  holder.appDataRoot = join(tmpDir, "appdata")
  trashItem.mockClear()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("settingsService 写盘不变量", () => {
  it("保存后无临时文件残留，且未由设置页管理的字段与其他节点原样保留", () => {
    writeConfig({
      ui: { locale: "en", unknownUiKey: 1 },
      ai: { mystery: "keep", compaction: { keepRecentTokens: 9999, reserveTokens: 123 } },
      topLevelUnknown: { a: 1 },
    })

    saveUiSettings({ locale: "zh", screenshotCleanupEnabled: true })

    expect(readdirSync(tmpDir)).toEqual(["config.json"])
    const config = readConfig()
    expect(config).toMatchObject({
      ui: { locale: "zh", screenshotCleanupEnabled: true, unknownUiKey: 1 },
      topLevelUnknown: { a: 1 },
      ai: { mystery: "keep", compaction: { keepRecentTokens: 9999, reserveTokens: 123 } },
    })
  })

  it("配置目录不存在时保存自动创建目录并写入配置", () => {
    holder.configPath = join(tmpDir, "nested", "deeper", "config.json")

    saveCliSettings({ enabled: ["gemini"], customPaths: {} })

    expect(existsSync(holder.configPath)).toBe(true)
    expect(readConfig()).toMatchObject({ cli: { enabled: ["gemini"], customPaths: {} } })
  })

  it("ui 完成通知开关缺省回退为启用，显式关闭后持久化", () => {
    writeConfig({ ui: { locale: "en" } })
    expect(getUiSettings()).toMatchObject({
      agentCompletionNotifyEnabled: true,
      openclawCompletionNotifyEnabled: true,
    })

    saveUiSettings({
      locale: "en",
      agentCompletionNotifyEnabled: false,
      openclawCompletionNotifyEnabled: false,
    })
    expect(getUiSettings()).toMatchObject({
      agentCompletionNotifyEnabled: false,
      openclawCompletionNotifyEnabled: false,
    })
  })

  it("配置文件非法 JSON 时保存抛错，且不产生临时文件", () => {
    writeFileSync(holder.configPath, "{ 非法 json", "utf8")

    expect(() => saveVoiceSettings({ apiKey: "k", model: "m", language: "zh" })).toThrow()
    expect(readFileSync(holder.configPath, "utf8")).toBe("{ 非法 json")
    expect(readdirSync(tmpDir)).toEqual(["config.json"])
  })

  it("规范化校验失败时抛错且配置文件保持不变", () => {
    const original = { ai: { providers: { a: { id: "dup" } } } }
    writeConfig(original)

    expect(() =>
      saveModelProviderSettings({
        providers: {
          a: {
            id: "dup",
            type: "openai",
            name: "a",
            options: { apiKey: "", baseURL: "" },
            models: {},
          },
          b: {
            id: "dup",
            type: "openai",
            name: "b",
            options: { apiKey: "", baseURL: "" },
            models: {},
          },
        },
        enabledProviders: ["dup"],
        defaultModel: { provider: "dup", model: "" },
        titleSummary: { provider: "dup", model: "" },
        suggestedQuestions: { provider: "dup", model: "" },
        compactionModel: { provider: "", model: "" },
        suggestedQuestionsEnabled: false,
        compactionEnabled: true,
        streamIdleTimeoutMs: 1000,
      }),
    ).toThrow("Provider ID 重复")

    expect(readConfig()).toEqual(original)
  })
})

describe("CLI 设置", () => {
  it("非法 enabled 与非法 customPaths 条目被过滤", () => {
    writeConfig({
      cli: {
        enabled: ["claude", "bogus", 123],
        customPaths: { claude: " /usr/bin/claude ", bogus: "/usr/bin/bogus", codex: 5, gemini: "" },
      },
    })

    expect(getCliSettings()).toEqual({
      enabled: ["claude"],
      customPaths: { claude: "/usr/bin/claude" },
    })
  })

  it("节点缺失或类型非法时回退默认（全量 CLI + 空路径）", () => {
    writeConfig({ cli: "not-an-object" })

    expect(getCliSettings()).toEqual({ enabled: [...ALL_CLI_IDS], customPaths: {} })
  })

  it("保存写回 cli 节点并保留同节点其他字段，往返一致", () => {
    writeConfig({ cli: { unknownFlag: true }, topLevelUnknown: 1 })

    saveCliSettings({ enabled: ["gemini"], customPaths: {} })

    expect(readConfig()).toMatchObject({
      cli: { unknownFlag: true, enabled: ["gemini"], customPaths: {} },
      topLevelUnknown: 1,
    })
    expect(getCliSettings()).toEqual({ enabled: ["gemini"], customPaths: {} })
  })
})

describe("LSP 设置", () => {
  it("节点缺失时按白名单语言补齐默认项", () => {
    writeConfig({})

    expect(getLspSettings()).toEqual(DEFAULT_LSP_SETTINGS)
  })

  it("自定义项覆盖默认：enabled 非布尔回退 true、args 过滤非字符串、customPath trim", () => {
    writeConfig({
      agent: {
        lsp: {
          languages: {
            typescript: {
              enabled: false,
              customPath: " /opt/ts/bin ",
              args: ["--stdio", 1, null, ""],
            },
            python: { enabled: "yes", args: ["--py"] },
          },
        },
      },
    })

    expect(getLspSettings().languages).toMatchObject({
      typescript: { enabled: false, customPath: "/opt/ts/bin", args: ["--stdio", ""] },
      python: { enabled: true, customPath: "", args: ["--py"] },
      json: { enabled: true, customPath: "", args: [] },
    })
  })

  it("兼容无 languages 的旧扁平结构，保存后写回 agent.lsp 并保留 agent 其他节点", () => {
    writeConfig({ agent: { lsp: { python: { enabled: false } }, mcp: {} } })

    expect(getLspSettings().languages.python).toEqual({ enabled: false, customPath: "", args: [] })

    saveLspSettings(getLspSettings())

    const config = readConfig() as { agent: Record<string, unknown> }
    expect(config.agent.mcp).toEqual({})
    expect(config.agent.lsp).toMatchObject({ languages: { python: { enabled: false } } })
  })
})

describe("MCP 设置", () => {
  it("command 缺失或为空的 server 被跳过", () => {
    writeConfig({
      agent: {
        mcp: {
          good: { command: ["node", "server.js", ""] },
          empty: { command: [] },
          wrongType: { command: "node" },
          notObject: "nope",
        },
      },
    })

    expect(getMcpSettings()).toEqual({
      servers: { good: { command: ["node", "server.js"] } },
    })
  })

  it("cwd/environment/disabled/timeout 仅在有效时写入", () => {
    writeConfig({
      agent: {
        mcp: {
          server: {
            command: ["npx", "-y", "pkg"],
            cwd: " /tmp/work ",
            environment: { " API_KEY ": "v", INVALID: 2, "": "x" },
            disabled: true,
            timeout: 0,
            unknown: "dropped",
          },
        },
      },
    })

    expect(getMcpSettings()).toEqual({
      servers: {
        server: {
          command: ["npx", "-y", "pkg"],
          cwd: "/tmp/work",
          environment: { API_KEY: "v" },
          disabled: true,
        },
      },
    })
  })

  it("保存为 agent.mcp 裸 map（无 servers 包裹），往返一致且保留 agent 其他节点", () => {
    writeConfig({ agent: { permissions: { defaultMode: "default" } } })

    saveMcpSettings({ servers: { a: { command: ["npx", "x"], timeout: 30 } } })

    expect((readConfig() as { agent: Record<string, unknown> }).agent).toMatchObject({
      permissions: { defaultMode: "default" },
      mcp: { a: { command: ["npx", "x"], timeout: 30 } },
    })
    expect(getMcpSettings()).toEqual({
      servers: { a: { command: ["npx", "x"], timeout: 30 } },
    })
  })
})

describe("Skill 设置", () => {
  it("normalizeSkillSettings 去重、trim 并丢弃非字符串", () => {
    expect(normalizeSkillSettings({ disabled: [" a ", "a", "", 3, null, "b"] })).toEqual({
      disabled: ["a", "b"],
    })
    expect(normalizeSkillSettings("not-an-object")).toEqual({ disabled: [] })
  })

  it("保存写回 agent.skills 并保留 agent 其他节点，往返一致", () => {
    writeConfig({ agent: { mcp: {}, skills: { legacy: 1 } } })

    saveSkillSettings({ disabled: [" x "] })

    expect((readConfig() as { agent: Record<string, unknown> }).agent).toMatchObject({
      mcp: {},
      skills: { disabled: ["x"] },
    })
  })
})

describe("Voice 设置", () => {
  it("缺失或非法字段回退默认值", () => {
    expect(normalizeVoiceSettings(undefined)).toEqual(DEFAULT_VOICE_SETTINGS)
    expect(normalizeVoiceSettings({ apiKey: 5, model: "  ", language: "en" })).toEqual({
      apiKey: "",
      model: DEFAULT_VOICE_SETTINGS.model,
      language: "en",
    })
  })

  it("保存整节点覆盖 voice 并 trim，往返一致", () => {
    writeConfig({ voice: { legacy: 1 }, topLevelUnknown: 2 })

    saveVoiceSettings({ apiKey: " k ", model: " m ", language: " zh " })

    expect(readConfig()).toMatchObject({
      voice: { apiKey: "k", model: "m", language: "zh" },
      topLevelUnknown: 2,
    })
    expect(getVoiceSettings()).toEqual({ apiKey: "k", model: "m", language: "zh" })
  })
})

describe("deleteSkill 安全边界", () => {
  it("拒绝删除 ~/.lx/skills 之外的路径且不触发废纸篓", async () => {
    const result = await deleteSkill(join(tmpDir, "outside", "SKILL.md"))

    expect(result.success).toBe(false)
    expect(trashItem).not.toHaveBeenCalled()
  })

  it("目录型 skill 删除 SKILL.md 所在子目录", async () => {
    const skillDir = join(holder.appDataRoot, "skills", "my-skill")
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: my-skill\ndescription: 测试\n---\n\nbody\n",
    )

    const result = await deleteSkill(join(skillDir, "SKILL.md"))

    expect(result).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(skillDir)
  })

  it("skills 根目录下的单文件按文件删除", async () => {
    const skillsRoot = join(holder.appDataRoot, "skills")
    mkdirSync(skillsRoot, { recursive: true })
    const skillFile = join(skillsRoot, "single.md")
    writeFileSync(skillFile, "---\nname: single\ndescription: 测试\n---\n\nbody\n")

    const result = await deleteSkill(skillFile)

    expect(result).toEqual({ success: true })
    expect(trashItem).toHaveBeenCalledWith(skillFile)
  })

  it("拒绝删除不存在的路径且不触发废纸篓", async () => {
    const result = await deleteSkill(join(holder.appDataRoot, "skills", "ghost", "SKILL.md"))

    expect(result.success).toBe(false)
    expect(trashItem).not.toHaveBeenCalled()
  })
})
