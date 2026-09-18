// configStore 专项测试：旧文件迁移、合并读、按域写、损坏隔离与 settingsService 集成。
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("electron", () => ({ shell: { trashItem: vi.fn(async () => undefined) } }))
vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
  }
})

import {
  EXTRA_CONFIG_FILE,
  loadConfigTree,
  readMergedConfig,
  updateMergedConfig,
} from "@/services/settingsService/configStore"

import {
  getTestConfigDir,
  readConfigTree,
  seedLegacyConfig,
  writeConfigTree,
} from "../../helpers/configLayout"

const collector = () => {
  const messages: string[] = []
  return { messages, warn: (message: string) => messages.push(message) }
}

const readJson = (filePath: string): unknown =>
  JSON.parse(readFileSync(filePath, "utf8")) as unknown

let tmpDir = ""
let configPath = ""

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-config-store-"))
  configPath = join(tmpDir, "config.json")
  holder.configPath = configPath
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("configStore 旧文件迁移", () => {
  it("按路由拆分并保留未知 key，旧文件改名为 .bak", () => {
    const legacy = {
      ai: { defaultModel: { provider: "p", model: "m" } },
      agent: { permissions: { defaultMode: "default" } },
      ui: { locale: "zh" },
      openclaw: { instances: {} },
      topLevelUnknown: { a: 1 },
    }
    seedLegacyConfig(configPath, legacy)

    const { messages, warn } = collector()
    expect(readMergedConfig(configPath, warn)).toEqual(legacy)
    expect(messages).toEqual([])

    const configDir = getTestConfigDir(configPath)
    expect(readdirSync(configDir).sort()).toEqual([
      "agent.json",
      "ai.json",
      "app.json",
      "extra.json",
      "openclaw.json",
    ])
    expect(readJson(join(configDir, EXTRA_CONFIG_FILE))).toEqual({ topLevelUnknown: { a: 1 } })
    expect(existsSync(configPath)).toBe(false)
    expect(existsSync(`${configPath}.bak`)).toBe(true)
  })

  it("迁移幂等：再次读取不改动布局与备份", () => {
    seedLegacyConfig(configPath, { ui: { locale: "en" } })
    readMergedConfig(configPath, () => {})

    const backup = readFileSync(`${configPath}.bak`, "utf8")
    const fileNames = readdirSync(getTestConfigDir(configPath)).sort()

    readMergedConfig(configPath, () => {})
    expect(readdirSync(getTestConfigDir(configPath)).sort()).toEqual(fileNames)
    expect(readFileSync(`${configPath}.bak`, "utf8")).toBe(backup)
  })

  it("崩溃残留 config.tmp 时清理后重新迁移成功", () => {
    seedLegacyConfig(configPath, { ui: { locale: "zh" } })
    const temporaryDir = `${getTestConfigDir(configPath)}.tmp`
    mkdirSync(temporaryDir, { recursive: true })
    writeFileSync(join(temporaryDir, "junk.json"), "{}")

    expect(readMergedConfig(configPath, () => {})).toEqual({ ui: { locale: "zh" } })
    expect(existsSync(temporaryDir)).toBe(false)
    expect(existsSync(`${configPath}.bak`)).toBe(true)
  })

  it("损坏的旧文件保持原样、不生成布局，只告警一次", () => {
    writeFileSync(configPath, "{ broken")

    const { messages, warn } = collector()
    expect(readMergedConfig(configPath, warn)).toEqual({})
    expect(existsSync(getTestConfigDir(configPath))).toBe(false)
    expect(readFileSync(configPath, "utf8")).toBe("{ broken")

    expect(readMergedConfig(configPath, warn)).toEqual({})
    expect(messages).toHaveLength(1)
  })

  it("空对象旧文件也完成迁移并备份", () => {
    seedLegacyConfig(configPath, {})
    expect(readMergedConfig(configPath, () => {})).toEqual({})
    expect(existsSync(`${configPath}.bak`)).toBe(true)
  })

  it("旧文件缺失时不创建布局目录", () => {
    expect(readMergedConfig(configPath, () => {})).toEqual({})
    expect(existsSync(getTestConfigDir(configPath))).toBe(false)
  })
})

describe("configStore 合并读", () => {
  it("跨文件合并全部顶层 key", () => {
    writeConfigTree(configPath, {
      ai: { enabled_providers: ["p"] },
      agent: { skills: { disabled: ["x"] } },
      ui: { locale: "zh" },
      topLevelUnknown: 1,
    })

    expect(loadConfigTree(configPath, () => {})).toEqual({
      ai: { enabled_providers: ["p"] },
      agent: { skills: { disabled: ["x"] } },
      ui: { locale: "zh" },
      topLevelUnknown: 1,
    })
  })

  it("顶层 key 重复时后读文件覆盖并告警", () => {
    writeConfigTree(configPath, { ui: { locale: "zh" } })
    writeFileSync(
      join(getTestConfigDir(configPath), EXTRA_CONFIG_FILE),
      JSON.stringify({ ui: { locale: "en" } }),
    )

    const { messages, warn } = collector()
    expect(loadConfigTree(configPath, warn).ui).toEqual({ locale: "en" })
    expect(messages.some((message) => message.includes("重复"))).toBe(true)
  })
})

describe("configStore 按域写", () => {
  it("只重写发生变化 key 所属文件，其余文件字节不变", () => {
    writeConfigTree(configPath, {
      ai: { enabled_providers: ["p"] },
      agent: { permissions: { defaultMode: "default" } },
      ui: { locale: "en" },
      topLevelUnknown: { a: 1 },
    })
    const configDir = getTestConfigDir(configPath)
    const before = {
      ai: readFileSync(join(configDir, "ai.json"), "utf8"),
      agent: readFileSync(join(configDir, "agent.json"), "utf8"),
      extra: readFileSync(join(configDir, EXTRA_CONFIG_FILE), "utf8"),
    }

    updateMergedConfig(
      configPath,
      (raw) => ({ ...raw, ui: { locale: "zh" } }),
      () => {},
    )

    expect(readFileSync(join(configDir, "ai.json"), "utf8")).toBe(before.ai)
    expect(readFileSync(join(configDir, "agent.json"), "utf8")).toBe(before.agent)
    expect(readFileSync(join(configDir, EXTRA_CONFIG_FILE), "utf8")).toBe(before.extra)
    expect(readConfigTree(configPath).ui).toEqual({ locale: "zh" })
  })

  it("保存新域创建对应文件，未知 key 变更写入 extra.json", () => {
    updateMergedConfig(
      configPath,
      () => ({ tokenSaver: { rtkEnabled: true } }),
      () => {},
    )
    const configDir = getTestConfigDir(configPath)
    expect(readJson(join(configDir, "app.json"))).toEqual({ tokenSaver: { rtkEnabled: true } })

    updateMergedConfig(
      configPath,
      (raw) => ({ ...raw, myNode: { x: 1 } }),
      () => {},
    )
    expect(readJson(join(configDir, EXTRA_CONFIG_FILE))).toEqual({ myNode: { x: 1 } })
  })

  it("无变化时不重写文件", () => {
    writeConfigTree(configPath, { ui: { locale: "zh" } })
    const filePath = join(getTestConfigDir(configPath), "app.json")
    const past = new Date(Date.now() - 60_000)
    utimesSync(filePath, past, past)

    updateMergedConfig(
      configPath,
      (raw) => ({ ui: raw.ui }),
      () => {},
    )

    expect(statSync(filePath).mtimeMs).toBeLessThan(Date.now() - 30_000)
    expect(
      readdirSync(getTestConfigDir(configPath)).filter((file) => file.endsWith(".tmp")),
    ).toEqual([])
  })
})

describe("configStore 损坏隔离", () => {
  it("单文件损坏：隔离为 .corrupt，其他域可读且保存只重写健康文件", () => {
    writeConfigTree(configPath, { ui: { locale: "zh" } })
    const configDir = getTestConfigDir(configPath)
    writeFileSync(join(configDir, "agent.json"), "{ broken", "utf8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      updateMergedConfig(configPath, (raw) => ({ ...raw, ui: { locale: "en" } }))
    } finally {
      warnSpy.mockRestore()
    }

    expect(readFileSync(join(configDir, "agent.json.corrupt"), "utf8")).toBe("{ broken")
    expect(readConfigTree(configPath).ui).toEqual({ locale: "en" })
    expect(readdirSync(configDir).filter((file) => file.endsWith(".tmp"))).toEqual([])
  })

  it("根节点非对象同样隔离并按空对象读取", () => {
    writeConfigTree(configPath, { ui: { locale: "zh" } })
    const configDir = getTestConfigDir(configPath)
    writeFileSync(join(configDir, "ai.json"), JSON.stringify(["array"]), "utf8")

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      expect(loadConfigTree(configPath).ui).toEqual({ locale: "zh" })
    } finally {
      warnSpy.mockRestore()
    }
    expect(existsSync(join(configDir, "ai.json.corrupt"))).toBe(true)
  })
})

describe("settingsService 集成", () => {
  it("旧文件首次读取自动迁移；保存写回布局文件且备份保持不变", async () => {
    const { getUiSettings, saveUiSettings } = await import("@/services/settingsService")
    seedLegacyConfig(configPath, { ui: { locale: "en" } })

    expect(getUiSettings().locale).toBe("en")
    expect(existsSync(`${configPath}.bak`)).toBe(true)

    saveUiSettings({
      locale: "zh",
      screenshotCleanupEnabled: true,
      agentCompletionNotifyEnabled: true,
      openclawCompletionNotifyEnabled: true,
    })

    expect(getUiSettings().locale).toBe("zh")
    expect(readConfigTree(configPath)).toMatchObject({ ui: { locale: "zh" } })
    expect(readJson(`${configPath}.bak`)).toEqual({ ui: { locale: "en" } })
  })
})
