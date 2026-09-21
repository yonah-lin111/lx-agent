// @vitest-environment jsdom

import type { PermissionSettings as PermissionSettingsConfig } from "@shared/contracts/agent"
import type { SubagentCapabilityCatalog } from "@shared/settings"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CollaborationModePermissions } from "@/features/settings/components/CollaborationModePermissions"

// jsdom 未实现 ResizeObserver（LxSelect 滚动定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const getSubagentCapabilities = vi.fn<() => Promise<SubagentCapabilityCatalog>>()

const baseSettings = (): PermissionSettingsConfig => ({
  defaultMode: "default",
  allow: [],
  deny: [],
  ask: [],
})

const loadedCapabilities = (): SubagentCapabilityCatalog => ({
  tools: [
    "read",
    "grep",
    "bash",
    "write",
    "edit",
    "apply_patch",
    "todowrite",
    "task",
    "memory",
    "wireframe",
  ],
  mcp: [{ name: "codegraph", connected: true }],
  skills: [{ name: "deploy", disabled: false }],
  subagents: [
    { name: "explorer", builtIn: true },
    { name: "worker", builtIn: true },
    { name: "custom-role", builtIn: false },
  ],
})

const renderComponent = (settings: PermissionSettingsConfig): ReturnType<typeof vi.fn> => {
  const setSettings = vi.fn()
  render(<CollaborationModePermissions settings={settings} setSettings={setSettings} />)
  return setSettings
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  getSubagentCapabilities.mockResolvedValue(loadedCapabilities())
  window.api = {
    settings: { getSubagentCapabilities },
  } as unknown as typeof window.api
})

describe("CollaborationModePermissions", () => {
  it("渲染四种模式行，非 build 模式展示永久禁用硬基线", async () => {
    renderComponent(baseSettings())

    expect(await screen.findByText("Build Mode")).toBeTruthy()
    expect(screen.getByText("Plan Mode")).toBeTruthy()
    expect(screen.getByText("Review Mode")).toBeTruthy()
    expect(screen.getByText("Design Mode")).toBeTruthy()
    // build 无锁定提示；plan/review/design 三行展示同一硬基线文案。
    expect(screen.getAllByText(/Permanently disabled:/)).toHaveLength(3)
    // design 行额外展示 wireframe。
    expect(screen.getAllByText(/wireframe/)).toHaveLength(1)
  })

  it("编辑 design：硬基线工具锁定不可勾选，确认后写入白名单", async () => {
    const setSettings = renderComponent(baseSettings())

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Design Mode" }))
    // 锁定行（7 个硬基线工具）始终可见且无勾选框。
    expect(await screen.findAllByText("Permanently disabled")).toHaveLength(7)
    expect(screen.queryByRole("checkbox", { name: "write" })).toBeNull()

    // 打开 tools 限制（预置除硬基线外的全选），取消 grep。
    fireEvent.click(screen.getByRole("checkbox", { name: /^Tools/ }))
    expect(screen.queryByRole("checkbox", { name: "write" })).toBeNull()
    expect(screen.queryByRole("checkbox", { name: "wireframe" })).toBeNull()
    expect(screen.getByRole("checkbox", { name: "read" })).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: "grep" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    expect(next.modes?.design?.tools).toContain("read")
    expect(next.modes?.design?.tools).not.toContain("grep")
    expect(next.modes?.design?.tools).not.toContain("write")
    expect(next.modes?.design?.tools).not.toContain("wireframe")
  })

  it("取消限制后确认删除该模式覆盖节点", async () => {
    const settings = baseSettings()
    settings.modes = { review: { tools: ["read"] } }
    const setSettings = renderComponent(settings)

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Review Mode" }))
    // 关闭 tools 限制（回到不限制）后确认：无任何分组 → 覆盖节点删除。
    fireEvent.click(screen.getByRole("checkbox", { name: /^Tools/ }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    expect(next.modes).toBeUndefined()
  })

  it("组内清空后保留显式空数组（该组全禁）", async () => {
    const setSettings = renderComponent(baseSettings())

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Plan Mode" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /^Tools/ }))
    fireEvent.click(screen.getByRole("button", { name: "Clear" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    expect(next.modes?.plan).toEqual({ tools: [] })
  })

  it("build 弹窗展示 subagents 角色白名单卡片，确认后写入 modes.build.subagents", async () => {
    const settings = baseSettings()
    settings.modes = { build: { subagents: ["explorer"] } }
    const setSettings = renderComponent(settings)

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Build Mode" }))
    // 已配置白名单回填：explorer 勾选，worker/custom-role 未勾选；内置角色带 Built-in 标记。
    expect(await screen.findByText("explorer")).toBeTruthy()
    expect(screen.getByText("custom-role")).toBeTruthy()
    expect(screen.getAllByText("Built-in")).toHaveLength(2)
    expect((screen.getByRole("checkbox", { name: "worker" }) as HTMLInputElement).checked).toBe(
      false,
    )

    fireEvent.click(screen.getByRole("checkbox", { name: "custom-role" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    expect(next.modes?.build?.subagents).toEqual(["explorer", "custom-role"])
  })

  it("非 build 模式弹窗不展示 subagents 组（task 已被硬基线整体禁用）", async () => {
    renderComponent(baseSettings())

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Plan Mode" }))
    expect(await screen.findByRole("checkbox", { name: /^Tools/ })).toBeTruthy()
    expect(screen.queryByRole("checkbox", { name: /^Subagents/ })).toBeNull()
  })
})
