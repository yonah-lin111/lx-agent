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
import type { ModelProvider, ModelProviderSettings } from "@shared/settings"
import { ALL_CLI_IDS, DEFAULT_LSP_SETTINGS, DEFAULT_VOICE_SETTINGS } from "@shared/settings"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  type ConfigTree,
  getTestConfigDir,
  readConfigTree,
  writeConfigTree,
} from "../../helpers/configLayout"

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
  getModelProviderSettings,
  getUiSettings,
  getVoiceSettings,
  normalizeSkillSettings,
  normalizeVoiceSettings,
  refreshOpencodeGoProvider,
  saveCliSettings,
  saveLspSettings,
  saveMcpSettings,
  saveModelProviderSettings,
  saveSkillSettings,
  saveUiSettings,
  saveVoiceSettings,
} from "@/services/settingsService"

let tmpDir: string

const readConfig = (): Record<string, unknown> => readConfigTree(holder.configPath)

const writeConfig = (config: unknown): void => {
  writeConfigTree(holder.configPath, config as ConfigTree)
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

    expect(
      readdirSync(getTestConfigDir(holder.configPath)).filter((file) => file.endsWith(".tmp")),
    ).toEqual([])
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

    expect(existsSync(getTestConfigDir(holder.configPath))).toBe(true)
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

  it("单个布局文件非法 JSON 时隔离该文件，保存其他域不受影响且无临时文件", () => {
    const configDir = getTestConfigDir(holder.configPath)
    mkdirSync(configDir, { recursive: true })
    writeFileSync(join(configDir, "agent.json"), "{ 非法 json", "utf8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      saveVoiceSettings({ apiKey: "k", model: "m", language: "zh" })
    } finally {
      warnSpy.mockRestore()
    }

    expect(readConfig()).toMatchObject({
      voice: { apiKey: "k", model: "m", language: "zh" },
    })
    expect(readFileSync(join(configDir, "agent.json.corrupt"), "utf8")).toBe("{ 非法 json")
    expect(readdirSync(configDir).filter((file) => file.endsWith(".tmp"))).toEqual([])
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

  it("模型计价与传输覆盖保存后往返保留，非法值被丢弃", () => {
    writeConfig({})

    const saved = saveModelProviderSettings({
      providers: {
        go: {
          id: "go",
          type: "openai-compatible",
          name: "go",
          options: { apiKey: "sk-go", baseURL: "https://opencode.ai/zen/go/v1" },
          models: {
            priced: {
              id: "priced",
              name: "Priced",
              transport: "anthropic",
              pricing: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
            },
            zero: {
              id: "zero",
              name: "Zero",
              pricing: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            bogus: {
              id: "bogus",
              name: "Bogus",
              transport: "bogus" as unknown as "anthropic",
              pricing: { input: -1, output: Number.NaN, cacheRead: 0, cacheWrite: 0 },
            },
          },
        },
      },
      enabledProviders: ["go"],
      defaultModel: { provider: "go", model: "priced" },
      titleSummary: { provider: "go", model: "priced" },
      suggestedQuestions: { provider: "go", model: "priced" },
      compactionModel: { provider: "", model: "" },
      suggestedQuestionsEnabled: false,
      compactionEnabled: true,
      streamIdleTimeoutMs: 1000,
    })

    expect(saved.providers.go.models.priced.pricing).toEqual({
      input: 0.3,
      output: 1.2,
      cacheRead: 0.006,
      cacheWrite: 0,
    })
    expect(saved.providers.go.models.priced.transport).toBe("anthropic")
    expect(saved.providers.go.models.zero.pricing).toBeUndefined()
    expect(saved.providers.go.models.bogus.pricing).toBeUndefined()
    expect(saved.providers.go.models.bogus.transport).toBeUndefined()
    // 落盘后重新读取仍保留合法计价与传输覆盖。
    expect(getModelProviderSettings().providers.go.models.priced.pricing).toEqual({
      input: 0.3,
      output: 1.2,
      cacheRead: 0.006,
      cacheWrite: 0,
    })
    expect(getModelProviderSettings().providers.go.models.priced.transport).toBe("anthropic")
  })
})

describe("内置 Provider 读写分离", () => {
  const goRecord = (overrides: Partial<ModelProvider> = {}): ModelProvider => ({
    id: "opencode-go",
    type: "openai-compatible",
    name: "OpenCode Go",
    options: { apiKey: "sk-go", baseURL: "https://opencode.ai/zen/go/v1" },
    models: {},
    ...overrides,
  })

  const customRecord = (id: string): ModelProvider => ({
    id,
    type: "openai",
    name: id,
    options: { apiKey: "", baseURL: "" },
    models: {},
  })

  const shellSettings = (providers: Record<string, ModelProvider>): ModelProviderSettings => ({
    providers,
    enabledProviders: Object.keys(providers),
    defaultModel: { provider: "opencode-go", model: "" },
    titleSummary: { provider: "opencode-go", model: "" },
    suggestedQuestions: { provider: "opencode-go", model: "" },
    compactionModel: { provider: "", model: "" },
    suggestedQuestionsEnabled: false,
    compactionEnabled: true,
    streamIdleTimeoutMs: 1000,
  })

  it("保存时内置记录写入独立文件，用户文件不含内置", () => {
    writeConfig({})

    const saved = saveModelProviderSettings(
      shellSettings({ "opencode-go": goRecord(), custom: customRecord("custom") }),
    )

    expect(Object.keys(saved.providers).sort()).toEqual(["custom", "opencode-go"])
    const configDir = getTestConfigDir(holder.configPath)
    expect(
      JSON.parse(readFileSync(join(configDir, "builtin-providers.json"), "utf8")),
    ).toMatchObject({ builtinProviders: { "opencode-go": { id: "opencode-go" } } })
    expect(
      Object.keys(
        (
          JSON.parse(readFileSync(join(configDir, "ai.json"), "utf8")) as {
            ai: { providers: Record<string, unknown> }
          }
        ).ai.providers,
      ),
    ).toEqual(["custom"])
    // 读取侧合并两文件。
    expect(Object.keys(getModelProviderSettings().providers).sort()).toEqual([
      "custom",
      "opencode-go",
    ])
  })

  it("云端刷新合并：保留用户字段，同步管理字段，新增追加，不删数据", async () => {
    writeConfig({})
    saveModelProviderSettings(
      shellSettings({
        "opencode-go": goRecord({
          name: "My Go",
          models: {
            "kimi-k2.7-code": {
              id: "kimi-k2.7-code",
              name: "My Kimi",
              pricing: { input: 9, output: 9, cacheRead: 9, cacheWrite: 9 },
            },
            "my-model": { id: "my-model", name: "My Model" },
          },
        }),
      }),
    )

    const result = await refreshOpencodeGoProvider(async () => ({
      npm: "@ai-sdk/openai-compatible",
      providerName: "OpenCode Go",
      models: {
        "kimi-k2.7-code": {
          id: "kimi-k2.7-code",
          name: "Upstream Kimi",
          limit: { context: 262144, output: 262144 },
          modalities: { input: ["text"], output: ["text"] },
          cost: { input: 0.1, output: 0.2, cache_read: 0.01 },
          reasoning_options: [],
        },
        "new-model": {
          id: "new-model",
          name: "New Model",
          cost: { input: 1, output: 2, cache_read: 0.1 },
          reasoning_options: [{ type: "effort", values: ["high"] }],
        },
      },
    }))

    expect(result).toEqual({
      providerId: "opencode-go",
      added: ["new-model"],
      updated: ["kimi-k2.7-code"],
    })
    const go = getModelProviderSettings().providers["opencode-go"]
    // 用户字段保留。
    expect(go.options.apiKey).toBe("sk-go")
    expect(go.name).toBe("My Go")
    expect(go.models["kimi-k2.7-code"].name).toBe("My Kimi")
    expect(go.models["kimi-k2.7-code"].pricing).toEqual({
      input: 9,
      output: 9,
      cacheRead: 9,
      cacheWrite: 9,
    })
    // 管理字段同步。
    expect(go.models["kimi-k2.7-code"].limit).toEqual({ context: 262144, output: 262144 })
    // 自建模型保留，新模型带云端计价。
    expect(go.models["my-model"].name).toBe("My Model")
    expect(go.models["new-model"].pricing).toEqual({
      input: 1,
      output: 2,
      cacheRead: 0.1,
      cacheWrite: 0,
    })
    expect(go.models["new-model"].variants).toEqual({ high: { reasoningEffort: "high" } })
  })

  it("无内置记录时刷新自动创建并启用", async () => {
    writeConfig({
      ai: {
        enabled_providers: ["custom"],
        providers: { custom: customRecord("custom") },
      },
    })

    const result = await refreshOpencodeGoProvider(async () => ({
      npm: "@ai-sdk/openai-compatible",
      providerName: "OpenCode Go",
      models: {},
    }))

    expect(result.added).toEqual([])
    const settings = getModelProviderSettings()
    expect(settings.providers["opencode-go"].options.apiKey).toBe("")
    expect(settings.enabledProviders).toEqual(["custom", "opencode-go"])
  })

  it("目录拉取失败时抛错且不写盘", async () => {
    writeConfig({})

    await expect(
      refreshOpencodeGoProvider(async () => {
        throw new Error("offline")
      }),
    ).rejects.toThrow("offline")
    expect(readConfig()).toEqual({})
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

  it("cwd/environment/disabled/timeout/serial 仅在有效时写入", () => {
    writeConfig({
      agent: {
        mcp: {
          server: {
            command: ["npx", "-y", "pkg"],
            cwd: " /tmp/work ",
            environment: { " API_KEY ": "v", INVALID: 2, "": "x" },
            disabled: true,
            timeout: 0,
            serial: true,
            unknown: "dropped",
          },
          serialOnly: { command: ["node", "s.js"], serial: false },
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
          serial: true,
        },
        serialOnly: { command: ["node", "s.js"], serial: false },
      },
    })
  })

  it("保存为 agent.mcp 裸 map（无 servers 包裹），往返一致且保留 agent 其他节点", () => {
    writeConfig({ agent: { permissions: { defaultMode: "default" } } })

    saveMcpSettings({
      servers: { a: { command: ["npx", "x"], timeout: 30, serial: true } },
    })

    expect((readConfig() as { agent: Record<string, unknown> }).agent).toMatchObject({
      permissions: { defaultMode: "default" },
      mcp: { a: { command: ["npx", "x"], timeout: 30, serial: true } },
    })
    expect(getMcpSettings()).toEqual({
      servers: { a: { command: ["npx", "x"], timeout: 30, serial: true } },
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
