import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/settingsService", () => ({
  getModelProviderSettings: vi.fn(),
  saveModelProviderSettings: vi.fn(),
  getPermissionSettings: vi.fn(),
  savePermissionSettings: vi.fn(),
  getSubagentCapabilityCatalog: vi.fn(() => ({ tools: [], mcp: [], skills: [], subagents: [] })),
  getSubagentSettings: vi.fn(() => ({ roles: {}, maxDepth: 1 })),
  getUiSettings: vi.fn(),
  saveUiSettings: vi.fn(),
  getCliSettings: vi.fn(),
  saveCliSettings: vi.fn(),
  getLspSettings: vi.fn(() => ({ languages: {} })),
  saveLspSettings: vi.fn(),
  getMcpSettings: vi.fn(() => ({ servers: {} })),
  saveMcpSettings: vi.fn(),
  getSkillSettings: vi.fn(() => ({ disabled: [] })),
  saveSkillSettings: vi.fn(),
  deleteSkill: vi.fn(),
  getVoiceSettings: vi.fn(() => ({ model: "whisper-large-v3-turbo" })),
  saveVoiceSettings: vi.fn(),
  getTokenSaverSettings: vi.fn(() => ({ rtkEnabled: true })),
  saveTokenSaverSettings: vi.fn(),
}))
vi.mock("@/services/voiceService", () => ({
  transcribeAudioWithGroq: vi.fn(),
}))
vi.mock("@/services/modelFetchService", () => ({
  fetchProviderModels: vi.fn(),
}))
vi.mock("@/services/cliToolService", () => ({
  getCliVersions: vi.fn(),
  runCliLifecycleAction: vi.fn(),
}))
vi.mock("@/services/mcpPresetService", () => ({
  getMcpPresetStatus: vi.fn(),
  installMcpPreset: vi.fn(),
}))
vi.mock("@/agent/stream/modelFactory", () => ({
  invalidateModelCache: vi.fn(),
}))

describe("settings IPC handlers", () => {
  beforeEach(() => handle.mockClear())

  it("为共享设置 channel 注册所有 handler", async () => {
    const { registerSettingsHandlers } = await import("@/ipc/settingsHandlers")

    registerSettingsHandlers()

    expect(handle).toHaveBeenCalledTimes(Object.keys(SETTINGS_CHANNELS).length)
    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(
      Object.values(SETTINGS_CHANNELS).sort(),
    )
  })

  it("内置角色 handler 返回生效权限与默认权限，供设置页判断覆盖", async () => {
    vi.resetModules()
    const { registerSettingsHandlers } = await import("@/ipc/settingsHandlers")
    const { getSubagentSettings } = await import("@/services/settingsService")

    vi.mocked(getSubagentSettings).mockReturnValue({
      roles: {},
      maxDepth: 1,
      builtinPermissions: { explorer: { tools: ["read"], skills: [] } },
    })
    registerSettingsHandlers()

    const handler = handle.mock.calls.find(
      ([channel]) => channel === SETTINGS_CHANNELS.getSubagentBuiltins,
    )?.[1]
    const builtins = handler()

    const explorer = builtins.find((role: { name: string }) => role.name === "explorer")
    expect(explorer.permissions).toEqual({ tools: ["read"], skills: [] })
    expect(explorer.defaultPermissions?.tools).toContain("ls")
    expect(builtins.map((role: { name: string }) => role.name)).toEqual(["explorer", "worker"])
  })
})
