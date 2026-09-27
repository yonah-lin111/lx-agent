// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UiPreviewPage } from "@/pages/ui"
import { LxChartCardDemo } from "@/pages/ui/components/LxChartCardDemo"
import { LxChartTooltipDemo } from "@/pages/ui/components/LxChartTooltipDemo"
import { LxCodeBlockDemo } from "@/pages/ui/components/LxCodeBlockDemo"
import { LxCommandPanelDemo } from "@/pages/ui/components/LxCommandPanelDemo"
import { LxDatePickerDemo } from "@/pages/ui/components/LxDatePickerDemo"
import { LxInfoTooltipDemo } from "@/pages/ui/components/LxInfoTooltipDemo"
import { LxNavItemDemo } from "@/pages/ui/components/LxNavItemDemo"
import { TreeBranchIconDemo } from "@/pages/ui/components/TreeBranchIconDemo"

const CJK_PATTERN = /[\u4e00-\u9fa5]/

const { mockParams } = vi.hoisted(() => ({ mockParams: { value: new URLSearchParams() } }))

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mockParams.value],
}))

describe("UI Preview 新增 Demo", () => {
  afterEach(() => {
    cleanup()
    mockParams.value = new URLSearchParams()
  })

  it("LxDatePickerDemo 覆盖四种模式并可展开日历弹层", () => {
    const { container } = render(<LxDatePickerDemo />)

    expect(screen.getByText("Date Mode")).not.toBeNull()
    expect(screen.getByText("Week Mode")).not.toBeNull()
    expect(screen.getByText("Month Mode")).not.toBeNull()
    expect(screen.getByText("Range Mode")).not.toBeNull()
    expect(screen.getByText("Size Tiers")).not.toBeNull()

    fireEvent.click(screen.getAllByRole("button", { expanded: false })[0])
    expect(screen.getByRole("dialog")).not.toBeNull()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("LxCodeBlockDemo 渲染基础 / 默认折叠 / 不可折叠三种形态", () => {
    const { container } = render(<LxCodeBlockDemo />)

    const blocks = container.querySelectorAll(".lx-code-block-wrapper")
    expect(blocks).toHaveLength(3)

    const collapsedContent = container.querySelectorAll(".markdown-code-content")[1] as HTMLElement
    expect(collapsedContent.style.display).toBe("none")

    const staticBlock = blocks[2]
    expect(staticBlock.querySelector(".markdown-code-collapse")).toBeNull()
    expect(staticBlock.querySelector(".markdown-code-copy")).not.toBeNull()

    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("LxChartCardDemo 渲染图表卡片与空态占位", () => {
    const { container } = render(<LxChartCardDemo />)

    expect(container.querySelectorAll(".lx-chart-card")).toHaveLength(2)
    expect(screen.getByText("No data")).not.toBeNull()
    expect(screen.getAllByText("Requests").length).toBeGreaterThanOrEqual(2)
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("LxChartTooltipDemo 静态渲染默认值与自定义格式", () => {
    const { container } = render(<LxChartTooltipDemo />)

    expect(screen.getAllByText("2026-09-27")).toHaveLength(2)
    expect(screen.getAllByText("123456")).toHaveLength(1)
    expect(screen.getAllByText("123,456")).toHaveLength(1)
    expect(screen.getAllByText("Requests")).toHaveLength(2)
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("LxCommandPanelDemo 支持键盘上下移动与回车选择", () => {
    const { container } = render(<LxCommandPanelDemo />)

    fireEvent.click(screen.getByRole("button", { name: "Open Command Panel" }))

    const listbox = screen.getByRole("listbox")
    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(6)
    expect(options[0].getAttribute("aria-selected")).toBe("true")

    const host = listbox.parentElement as HTMLElement
    fireEvent.keyDown(host, { key: "ArrowDown" })
    expect(screen.getByRole("option", { selected: true }).textContent).toContain("Open Folder")

    fireEvent.keyDown(host, { key: "Enter" })
    expect(screen.getByText("Selected: Open Folder")).not.toBeNull()

    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("LxNavItemDemo 覆盖层级、尺寸与截断 Tooltip 分区", () => {
    const { container } = render(<LxNavItemDemo />)

    expect(screen.getByText("Levels & Indentation")).not.toBeNull()
    expect(screen.getByText("Size Tiers")).not.toBeNull()
    expect(screen.getByText("Truncated Label Tooltip")).not.toBeNull()
    expect(
      screen.getByText("A very long navigation label used to verify truncation and hover tooltip"),
    ).not.toBeNull()

    const smallRow = screen.getByText("LxNavItem (small)").closest(".lx-nav-item")
    const largeRow = screen.getByText("LxNavItem (large)").closest(".lx-nav-item")
    expect(smallRow?.className).toContain("h-6")
    expect(largeRow?.className).toContain("h-8")

    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("TreeBranchIconDemo 以分支图标展示目录缩进", () => {
    const { container } = render(<TreeBranchIconDemo />)

    expect(screen.getByText("Tree Hierarchy")).not.toBeNull()
    const branchRows = container.querySelectorAll(".lx-nav-item svg")
    expect(branchRows.length).toBeGreaterThanOrEqual(5)
    expect(screen.getByText("index.tsx")).not.toBeNull()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("LxInfoTooltipDemo 渲染默认图标与自定义触发元素", () => {
    const { container } = render(<LxInfoTooltipDemo />)

    expect(screen.getByText("Default Icon")).not.toBeNull()
    expect(screen.getByText("Custom Trigger")).not.toBeNull()
    expect(screen.getByLabelText("Info")).not.toBeNull()
    expect(screen.getByText("View details")).not.toBeNull()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })

  it("UiPreviewPage 在 section=input 时只渲染 LxInputDemo", () => {
    mockParams.value = new URLSearchParams("section=input")
    const { container } = render(<UiPreviewPage />)

    expect(screen.getByText("Basic Input")).not.toBeNull()
    expect(screen.getByText("Special Modes")).not.toBeNull()
    expect(screen.queryByText("Agent Composite Input")).toBeNull()
    expect(CJK_PATTERN.test(container.textContent ?? "")).toBe(false)
  })
})
