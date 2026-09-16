// Token Saver 设置读写测试：默认值、非法值回退、写盘保留其他节点。
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DEFAULT_TOKEN_SAVER_SETTINGS } from "@shared/settings"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({ configPath: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
  }
})

import {
  getTokenSaverSettings,
  normalizeTokenSaverSettings,
  saveTokenSaverSettings,
} from "@/services/settingsService"

let tmpDir: string

const readConfig = (): Record<string, unknown> =>
  JSON.parse(readFileSync(holder.configPath, "utf8")) as Record<string, unknown>

const writeConfig = (config: unknown): void => {
  writeFileSync(holder.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "lx-settings-token-saver-"))
  holder.configPath = join(tmpDir, "config.json")
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe("normalizeTokenSaverSettings", () => {
  it("缺失节点返回默认配置", () => {
    expect(normalizeTokenSaverSettings(undefined)).toEqual(DEFAULT_TOKEN_SAVER_SETTINGS)
    expect(normalizeTokenSaverSettings(null)).toEqual(DEFAULT_TOKEN_SAVER_SETTINGS)
    expect(normalizeTokenSaverSettings("bad")).toEqual(DEFAULT_TOKEN_SAVER_SETTINGS)
  })

  it("非法档位回退默认档位", () => {
    const normalized = normalizeTokenSaverSettings({
      rtkEnabled: false,
      cavemanEnabled: true,
      cavemanLevel: "bogus",
      ponytailEnabled: true,
      ponytailLevel: "bogus",
    })
    expect(normalized).toEqual({
      rtkEnabled: false,
      cavemanEnabled: true,
      cavemanLevel: DEFAULT_TOKEN_SAVER_SETTINGS.cavemanLevel,
      ponytailEnabled: true,
      ponytailLevel: DEFAULT_TOKEN_SAVER_SETTINGS.ponytailLevel,
    })
  })

  it("合法字段原样保留", () => {
    const normalized = normalizeTokenSaverSettings({
      rtkEnabled: false,
      cavemanEnabled: true,
      cavemanLevel: "wenyan",
      ponytailEnabled: true,
      ponytailLevel: "ultra",
    })
    expect(normalized).toEqual({
      rtkEnabled: false,
      cavemanEnabled: true,
      cavemanLevel: "wenyan",
      ponytailEnabled: true,
      ponytailLevel: "ultra",
    })
  })
})

describe("getTokenSaverSettings / saveTokenSaverSettings", () => {
  it("配置文件缺失时返回默认配置", () => {
    expect(getTokenSaverSettings()).toEqual(DEFAULT_TOKEN_SAVER_SETTINGS)
  })

  it("保存后可读回，且其他节点原样保留、无临时文件残留", () => {
    writeConfig({
      ui: { locale: "zh" },
      topLevelUnknown: { a: 1 },
    })

    const saved = saveTokenSaverSettings({
      rtkEnabled: false,
      cavemanEnabled: true,
      cavemanLevel: "lite",
      ponytailEnabled: false,
      ponytailLevel: "full",
    })

    expect(saved.rtkEnabled).toBe(false)
    expect(getTokenSaverSettings()).toEqual(saved)
    expect(readdirSync(tmpDir)).toEqual(["config.json"])
    expect(readConfig()).toMatchObject({
      ui: { locale: "zh" },
      topLevelUnknown: { a: 1 },
      tokenSaver: saved,
    })
  })

  it("保存非法档位时按默认档位落盘", () => {
    const saved = saveTokenSaverSettings({
      rtkEnabled: true,
      cavemanEnabled: true,
      cavemanLevel: "bogus" as never,
      ponytailEnabled: false,
      ponytailLevel: "bogus" as never,
    })
    expect(saved.cavemanLevel).toBe(DEFAULT_TOKEN_SAVER_SETTINGS.cavemanLevel)
    expect(saved.ponytailLevel).toBe(DEFAULT_TOKEN_SAVER_SETTINGS.ponytailLevel)
    expect(readConfig()).toMatchObject({ tokenSaver: saved })
  })
})
