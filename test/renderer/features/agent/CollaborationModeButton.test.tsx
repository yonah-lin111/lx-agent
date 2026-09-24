// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CollaborationModeButton } from "@/features/agent/components/status-bar/CollaborationModeButton"

// jsdom 未实现 ResizeObserver / requestAnimationFrame，用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

// jsdom 无布局：提供非零矩形，让 LxTooltip 通过零矩形门禁并移除气泡隐藏态。
const rect = {
  left: 100,
  right: 140,
  top: 100,
  bottom: 120,
  width: 40,
  height: 20,
  x: 100,
  y: 100,
  toJSON: () => ({}),
} as DOMRect
Element.prototype.getBoundingClientRect = () => rect

describe("CollaborationModeButton 模式展示与点击选择", () => {
  afterEach(() => {
    cleanup()
  })

  it("展示当前模式短名与对应图标（Minimal 为终端图标）", () => {
    const { container } = render(<CollaborationModeButton mode="minimal" />)
    expect(screen.getByText("Minimal")).toBeTruthy()
    expect(container.querySelector(".lucide-terminal")).toBeTruthy()
  })

  it("未传 onModeChange 时保持纯展示：点击不弹出模式列表", () => {
    render(<CollaborationModeButton mode="build" />)
    fireEvent.click(screen.getByText("Build"))
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("auto 基础模式展示「Auto · 有效模式」组合短名", () => {
    render(<CollaborationModeButton mode="auto" effectiveMode="plan" />)
    expect(screen.getByText("Auto · Plan")).toBeTruthy()
  })

  it("auto 基础模式且有效模式为 build 时展示 Auto · Build", () => {
    render(<CollaborationModeButton mode="auto" effectiveMode="build" />)
    expect(screen.getByText("Auto · Build")).toBeTruthy()
  })

  it("点击弹出六种模式列表（含 Auto）：当前项勾选，选择后回调并关闭", async () => {
    const onModeChange = vi.fn()
    render(<CollaborationModeButton mode="design" onModeChange={onModeChange} />)

    fireEvent.click(screen.getByText("Design"))

    const listbox = await screen.findByRole("listbox")
    expect(listbox).toBeTruthy()
    const options = screen.getAllByRole("option")
    expect(options.map((option) => option.textContent)).toEqual([
      "Build Mode",
      "Auto Mode",
      "Plan Mode",
      "Review Mode",
      "Design Mode",
      "Minimal Mode",
    ])
    expect(screen.getByRole("option", { name: "Design Mode" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.getByRole("option", { name: "Minimal Mode" }).getAttribute("aria-selected")).toBe(
      "false",
    )

    fireEvent.click(screen.getByRole("option", { name: "Minimal Mode" }))
    expect(onModeChange).toHaveBeenCalledWith("minimal")
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull())
  })
})
