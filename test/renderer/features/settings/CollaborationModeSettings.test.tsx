// @vitest-environment jsdom

import type { PermissionSettings as PermissionSettingsConfig } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CollaborationModeSettings } from "@/features/settings/components/CollaborationModeSettings"

// jsdom 未实现 ResizeObserver（LxSelect 滚动定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const baseSettings = (): PermissionSettingsConfig => ({
  defaultMode: "default",
  allow: [],
  deny: [],
  ask: [],
})

// 协作模式权限卡片加载能力目录（此处仅需返回空目录）。
const getSubagentCapabilities = vi.fn(async () => ({
  tools: [] as string[],
  mcp: [] as { name: string; connected: boolean }[],
  skills: [] as { name: string; disabled: boolean }[],
  subagents: [] as { name: string; builtIn: boolean }[],
}))

describe("CollaborationModeSettings", () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.api = {
      settings: { getSubagentCapabilities },
    } as unknown as typeof window.api
  })

  it("默认协作模式选择器：展示当前模式并可切换到 Minimal", () => {
    const setSettings = vi.fn()
    render(<CollaborationModeSettings settings={baseSettings()} setSettings={setSettings} />)

    // 选择器触发器按当前值展示 Build Mode（协作模式权限卡片同文案，用 aria-haspopup 定位）。
    const trigger = screen
      .getAllByRole("button")
      .find(
        (button) =>
          button.getAttribute("aria-haspopup") === "listbox" &&
          button.textContent?.includes("Build Mode"),
      )
    expect(trigger).toBeTruthy()

    fireEvent.click(trigger as HTMLButtonElement)
    fireEvent.mouseDown(screen.getByRole("option", { name: "Minimal Mode" }))

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ collaborationMode: "minimal" }),
    )
  })

  it("同分区内嵌协作模式能力权限卡片（五种模式行）", async () => {
    render(<CollaborationModeSettings settings={baseSettings()} setSettings={vi.fn()} />)

    expect((await screen.findAllByText("Plan Mode")).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Review Mode").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Design Mode").length).toBeGreaterThan(0)
  })

  it("Auto 模式可用目标模式：展示各模式勾选状态并支持切换", () => {
    const setSettings = vi.fn()
    const settings: PermissionSettingsConfig = {
      ...baseSettings(),
      autoEnabledModes: ["plan", "review"],
    }
    const { container } = render(
      <CollaborationModeSettings settings={settings} setSettings={setSettings} />,
    )

    // Build 模式固定启用
    expect(screen.getByText("Always Enabled (Built-in)")).toBeTruthy()

    const checkboxes = container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes.length).toBe(3) // plan, review, design
    expect(checkboxes[0].checked).toBe(true) // plan
    expect(checkboxes[1].checked).toBe(true) // review
    expect(checkboxes[2].checked).toBe(false) // design

    // 点击取消勾选 plan
    fireEvent.click(checkboxes[0])
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoEnabledModes: ["review"] }),
    )
  })
})
