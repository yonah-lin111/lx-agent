// @vitest-environment jsdom

import { MCP_PRESETS, type McpPresetStatusItem } from "@shared/mcpPresets"
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { McpSettings } from "@/features/settings/components/McpSettings"
import { useSettingsDraftStore } from "@/features/settings/hooks/settingsDraftStore"

// jsdom 未实现 ResizeObserver（LxTooltip 定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const installedStatuses = (): McpPresetStatusItem[] =>
  MCP_PRESETS.map((preset) => ({
    id: preset.id,
    installed: true,
    detectedPath: `/usr/local/bin/${preset.probeBin}`,
  }))

const getMcpSettings = vi.fn(async () => ({ servers: {} }))
const saveMcpSettings = vi.fn(async (settings: unknown) => settings)
const getMcpPresetStatus = vi.fn(async () => installedStatuses())
const installMcpPreset = vi.fn(async () => ({ success: true }))
const getMcpStatus = vi.fn(async () => [])

describe("McpSettings 预设流程", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    useSettingsDraftStore.getState().setActiveSection("mcp")
    window.api = {
      settings: {
        getMcpSettings,
        saveMcpSettings,
        reconnectMcp: vi.fn(async () => undefined),
        getMcpPresetStatus,
        installMcpPreset,
      },
      agent: { getMcpStatus },
    } as unknown as typeof window.api
  })

  it("启用预设写入草稿并在保存时落到 servers", async () => {
    render(<McpSettings />)
    await screen.findByText("Context7")

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable CodeGraph" }))

    // 预设卡片消失、服务器列表出现对应卡片。
    await waitFor(() => expect(screen.queryByText("CodeGraph")).toBeNull())
    const mainCard = screen.getByText("codegraph").closest(".settings-item-card") as HTMLElement
    expect(mainCard).not.toBeNull()
    // 服务器卡片常驻"预设"标记与 GitHub 官网入口。
    expect(within(mainCard).getByText("Preset")).toBeTruthy()
    expect(within(mainCard).getByRole("button", { name: "Homepage CodeGraph" })).toBeTruthy()
    expect(useSettingsDraftStore.getState().isDirty).toBe(true)

    const saved = await useSettingsDraftStore.getState().save()

    expect(saved).toBe(true)
    expect(saveMcpSettings).toHaveBeenCalledWith({
      servers: {
        codegraph: { command: ["codegraph", "serve", "--mcp"], timeout: 30_000 },
      },
    })
  })

  it("点击安装调用安装 IPC 并刷新预设探测状态", async () => {
    getMcpPresetStatus
      .mockResolvedValueOnce(
        installedStatuses().map((item) =>
          item.id === "codegraph" ? { ...item, installed: false, detectedPath: null } : item,
        ),
      )
      .mockResolvedValueOnce(installedStatuses())

    render(<McpSettings />)

    fireEvent.click(await screen.findByRole("button", { name: "Install CodeGraph" }))

    await waitFor(() => expect(installMcpPreset).toHaveBeenCalledWith("codegraph"))
    await waitFor(() => expect(getMcpPresetStatus).toHaveBeenCalledTimes(2))
    // 安装成功后按钮消失、探测路径出现。
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Install CodeGraph" })).toBeNull(),
    )
    expect(screen.getByText("/usr/local/bin/codegraph")).toBeTruthy()
  })
})
