// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
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

const statefulServer = { command: ["npx", "stateful-mcp"], timeout: 30_000, serial: true }
const plainServer = { command: ["npx", "plain-mcp"], timeout: 30_000 }

const getMcpSettings = vi.fn(async () => ({
  servers: { stateful: statefulServer, plain: plainServer },
}))
const saveMcpSettings = vi.fn(async (settings: unknown) => settings)
const getMcpPresetStatus = vi.fn(async () => [])
const installMcpPreset = vi.fn(async () => ({ success: true }))
const getMcpStatus = vi.fn(async () => [])

describe("McpSettings 串行执行参数", () => {
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

  it("卡片展示串行标记，编辑弹窗按配置回填并支持开启", async () => {
    render(<McpSettings />)
    await screen.findByText("stateful")

    const statefulCard = screen.getByText("stateful").closest(".settings-item-card") as HTMLElement
    const plainCard = screen.getByText("plain").closest(".settings-item-card") as HTMLElement
    expect(within(statefulCard).getByText("Serial execution")).toBeTruthy()
    expect(within(plainCard).queryByText("Serial execution")).toBeNull()

    // 编辑未开启串行的服务：默认未勾选，勾选后确认写入草稿。
    fireEvent.click(within(plainCard).getByRole("button", { name: "Edit" }))
    const serialCheckbox = (await screen.findByRole("checkbox", {
      name: "Serial execution",
    })) as HTMLInputElement
    expect(serialCheckbox.checked).toBe(false)

    fireEvent.click(serialCheckbox)
    fireEvent.click(screen.getByText("Confirm"))

    expect(await useSettingsDraftStore.getState().save()).toBe(true)
    expect(saveMcpSettings).toHaveBeenCalledWith({
      servers: { stateful: statefulServer, plain: { ...plainServer, serial: true } },
    })
  })

  it("编辑已开启串行的服务可取消串行执行", async () => {
    render(<McpSettings />)
    await screen.findByText("stateful")

    const statefulCard = screen.getByText("stateful").closest(".settings-item-card") as HTMLElement
    fireEvent.click(within(statefulCard).getByRole("button", { name: "Edit" }))

    const serialCheckbox = (await screen.findByRole("checkbox", {
      name: "Serial execution",
    })) as HTMLInputElement
    expect(serialCheckbox.checked).toBe(true)

    fireEvent.click(serialCheckbox)
    fireEvent.click(screen.getByText("Confirm"))

    expect(await useSettingsDraftStore.getState().save()).toBe(true)
    expect(saveMcpSettings).toHaveBeenCalledWith({
      servers: {
        stateful: { command: ["npx", "stateful-mcp"], timeout: 30_000 },
        plain: plainServer,
      },
    })
  })
})
