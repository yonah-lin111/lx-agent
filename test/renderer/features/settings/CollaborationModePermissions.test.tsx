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
    // explorer 只读能力集：与所有模式硬基线兼容。
    { name: "explorer", builtIn: true, permissions: { tools: ["read", "grep", "lsp"] } },
    // worker 不限制能力集（含 write 等）：非 build 模式永久禁用。
    { name: "worker", builtIn: true },
    // 只读自定义角色：非 build 模式可用。
    { name: "custom-role", builtIn: false, permissions: { tools: ["read"] } },
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
    // 锁定行（6 个硬基线工具 + worker 角色，其能力集含硬基线工具）始终可见且无勾选框。
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
    // plan 缺省 subagents = explorer，两个受限组都有 Clear：首个对应 tools。
    fireEvent.click(screen.getByRole("checkbox", { name: /^Tools/ }))
    fireEvent.click(screen.getAllByRole("button", { name: "Clear" })[0])
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    expect(next.modes?.plan?.tools).toEqual([])
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

  it("非 build 弹窗：能力集冲突角色（worker）永久禁用不可勾选，只读角色可选", async () => {
    const setSettings = renderComponent(baseSettings())

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Plan Mode" }))
    // 缺省即受限：explorer 已勾选；worker 因能力集含硬基线工具被锁定（无勾选框）。
    expect(await screen.findByText("custom-role")).toBeTruthy()
    expect((screen.getByRole("checkbox", { name: "explorer" }) as HTMLInputElement).checked).toBe(
      true,
    )
    expect(screen.queryByRole("checkbox", { name: "worker" })).toBeNull()
    expect(screen.getAllByText("Permanently disabled")).toHaveLength(6)

    fireEvent.click(screen.getByRole("checkbox", { name: "custom-role" }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    expect(next.modes?.plan?.subagents).toEqual(["explorer", "custom-role"])
  })

  it("白名单角色变为永久禁用时：行内提示死条目，编辑确认后自动清理", async () => {
    const settings = baseSettings()
    settings.modes = { plan: { subagents: ["explorer", "worker"] } }
    const setSettings = renderComponent(settings)

    // 行内提示锁定角色（worker 能力集无限制 → 与非 build 硬基线冲突）。
    expect(await screen.findByText(/Permanently disabled roles: worker/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Plan Mode" }))
    expect(screen.queryByRole("checkbox", { name: "worker" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))

    await waitFor(() => expect(setSettings).toHaveBeenCalledTimes(1))
    const next = setSettings.mock.calls[0][0] as PermissionSettingsConfig
    // 清理后仅剩 explorer（= 非 build 缺省）→ 覆盖节点整体删除。
    expect(next.modes).toBeUndefined()
  })

  it("build 弹窗无锁定角色（硬基线为空），worker 可勾选", async () => {
    const settings = baseSettings()
    settings.modes = { build: { subagents: ["custom-role"] } }
    renderComponent(settings)

    fireEvent.click(screen.getByRole("button", { name: "Edit permissions Build Mode" }))
    // 目录加载后：worker 未被锁定，可与只读角色一样勾选。
    expect(await screen.findByRole("checkbox", { name: "worker" })).toBeTruthy()
    expect(screen.queryByText("Permanently disabled")).toBeNull()
  })
})
