import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { OpenClawSettings } from "@shared/settings"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const holder = vi.hoisted(() => ({
  configPath: "",
}))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getConfigPath: () => holder.configPath,
  }
})

describe("OpenClaw settings normalization", () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "openclaw-settings-test-"))
    holder.configPath = join(tmpDir, "config.json")
    writeFileSync(holder.configPath, JSON.stringify({}))
  })

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it("非对象输入回退为默认值", async () => {
    const { normalizeOpenClawSettings } = await import("@/services/settingsService")

    expect(normalizeOpenClawSettings(undefined)).toEqual({ instances: {} })
    expect(normalizeOpenClawSettings("nope")).toEqual({ instances: {} })
  })

  it("丢弃缺少 gatewayUrl 的实例并补全默认字段", async () => {
    const { normalizeOpenClawSettings } = await import("@/services/settingsService")

    const normalized = normalizeOpenClawSettings({
      instances: {
        broken: { name: "Broken" },
        local: { gatewayUrl: "  ws://127.0.0.1:18789  " },
      },
    })

    expect(Object.keys(normalized.instances)).toEqual(["local"])
    expect(normalized.instances.local).toEqual({
      name: "ws://127.0.0.1:18789",
      gatewayUrl: "ws://127.0.0.1:18789",
      authMode: "token",
      enabled: true,
      agents: [],
    })
  })

  it("规范化 authMode、agents 并保留远端配置", async () => {
    const { normalizeOpenClawSettings } = await import("@/services/settingsService")

    const normalized = normalizeOpenClawSettings({
      instances: {
        cloud: {
          name: " Cloud ",
          gatewayUrl: "wss://gateway.example.com",
          authMode: "device",
          token: " secret ",
          enabled: false,
          agents: [
            { id: " lily ", name: "Lily", workspace: "/tmp/lily", isDefault: true },
            { id: "" },
            "garbage",
          ],
        },
      },
      defaultInstanceId: "cloud",
      defaultAgentId: "lily",
    })

    expect(normalized.instances.cloud).toEqual({
      name: "Cloud",
      gatewayUrl: "wss://gateway.example.com",
      authMode: "device",
      token: "secret",
      enabled: false,
      agents: [{ id: "lily", name: "Lily", workspace: "/tmp/lily", isDefault: true }],
    })
    expect(normalized.defaultInstanceId).toBe("cloud")
    expect(normalized.defaultAgentId).toBe("lily")
  })

  it("丢弃指向不存在实例的 defaultInstanceId", async () => {
    const { normalizeOpenClawSettings } = await import("@/services/settingsService")

    const normalized = normalizeOpenClawSettings({
      instances: { local: { gatewayUrl: "ws://127.0.0.1:18789" } },
      defaultInstanceId: "missing",
    })

    expect(normalized.defaultInstanceId).toBeUndefined()
  })

  it("未知 authMode 回退为 token", async () => {
    const { normalizeOpenClawSettings } = await import("@/services/settingsService")

    const normalized = normalizeOpenClawSettings({
      instances: { local: { gatewayUrl: "ws://127.0.0.1:18789", authMode: "whatever" } },
    })

    expect(normalized.instances.local.authMode).toBe("token")
  })

  it("保存后读取可往返一致", async () => {
    const { saveOpenClawSettings, getOpenClawSettings } = await import("@/services/settingsService")

    const input: OpenClawSettings = {
      instances: {
        local: {
          name: "Local",
          gatewayUrl: "ws://127.0.0.1:18789",
          authMode: "token",
          token: "t0ken",
          enabled: true,
          agents: [{ id: "lily", name: "Lily" }],
        },
      },
      defaultInstanceId: "local",
    }

    saveOpenClawSettings(input)

    expect(getOpenClawSettings()).toEqual(input)
  })

  it("保存 OpenClaw 配置不清空其他配置节点", async () => {
    const { saveOpenClawSettings } = await import("@/services/settingsService")
    const { readFileSync } = await import("node:fs")

    writeFileSync(holder.configPath, JSON.stringify({ ui: { locale: "zh" } }))
    saveOpenClawSettings({ instances: {} })

    const raw = JSON.parse(readFileSync(holder.configPath, "utf8")) as Record<string, unknown>
    expect(raw.ui).toEqual({ locale: "zh" })
    expect(raw.openclaw).toEqual({ instances: {} })
  })
})
