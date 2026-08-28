// @vitest-environment jsdom

import type { PermissionSettings as PermissionSettingsConfig } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PermissionSettings } from "@/features/settings/components/PermissionSettings"

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

describe("PermissionSettings", () => {
  beforeEach(cleanup)

  it("切换权限模式触发 setSettings", () => {
    const setSettings = vi.fn()
    render(<PermissionSettings settings={baseSettings()} setSettings={setSettings} />)

    fireEvent.click(screen.getByText("default — Ask per rule"))
    // LxSelect 选项在 mousedown 时提交（避免与 click 收起冲突）。
    fireEvent.mouseDown(screen.getByText("acceptEdits — Auto-allow write/edit"))

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ defaultMode: "acceptEdits" }),
    )
  })

  it("添加规则触发 setSettings 追加空条目", () => {
    const setSettings = vi.fn()
    render(<PermissionSettings settings={baseSettings()} setSettings={setSettings} />)

    fireEvent.click(screen.getByRole("button", { name: "Add Allow Rules Rule" }))

    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ allow: [""] }))
  })

  it("编辑规则内容触发 setSettings", () => {
    const settings = baseSettings()
    settings.allow = [""]
    const setSettings = vi.fn()
    render(<PermissionSettings settings={settings} setSettings={setSettings} />)

    fireEvent.change(screen.getByPlaceholderText("ToolName(arg), e.g. Bash(git status)"), {
      target: { value: "Bash(git status)" },
    })

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ allow: ["Bash(git status)"] }),
    )
  })

  it("删除规则", () => {
    const settings = baseSettings()
    settings.allow = ["Bash(git status)"]
    const setSettings = vi.fn()
    render(<PermissionSettings settings={settings} setSettings={setSettings} />)

    fireEvent.click(screen.getByRole("button", { name: "Delete Rule Bash(git status)" }))

    expect(setSettings).toHaveBeenCalledWith(expect.objectContaining({ allow: [] }))
  })

  it("非法规则输入框标记 aria-invalid", () => {
    const settings = baseSettings()
    settings.allow = ["not a rule"]
    render(<PermissionSettings settings={settings} setSettings={vi.fn()} />)

    expect(
      screen
        .getByPlaceholderText("ToolName(arg), e.g. Bash(git status)")
        .getAttribute("aria-invalid"),
    ).toBe("true")
  })

  it("切换沙箱策略触发 setSettings", () => {
    const setSettings = vi.fn()
    render(<PermissionSettings settings={baseSettings()} setSettings={setSettings} />)

    fireEvent.click(screen.getByText("workspace-write — Workspace Read & Write (Default)"))
    fireEvent.mouseDown(screen.getByText("read-only — Read Only Sandbox"))

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxPolicy: "read-only" }),
    )
  })

  it("bypassPermissions 模式显示不弹窗提示", () => {
    const settings = baseSettings()
    settings.defaultMode = "bypassPermissions"
    render(<PermissionSettings settings={settings} setSettings={vi.fn()} />)

    expect(screen.queryAllByText(/bypassPermissions/).length).toBeGreaterThan(0)
  })
})
