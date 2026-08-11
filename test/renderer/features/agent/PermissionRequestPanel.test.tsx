// @vitest-environment jsdom

import type { PermissionRequest } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { CSSProperties } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  PERMISSION_CONFIRM_OPTIONS,
  PERMISSION_SELECT_OPTIONS,
  PermissionRequestPanel,
} from "@/features/agent/components/PermissionRequestPanel"

const request: PermissionRequest = {
  requestId: "r1",
  toolName: "bash",
  args: { command: "ls" },
  summary: "ls",
  mode: "default",
  sessionId: "s1",
}

const position: CSSProperties = { top: 0, left: 0, width: 300 }

type PanelProps = Parameters<typeof PermissionRequestPanel>[0]

const renderPanel = (props: Partial<PanelProps> = {}) =>
  render(
    <PermissionRequestPanel
      isOpen
      position={position}
      request={request}
      phase="select"
      options={PERMISSION_SELECT_OPTIONS}
      activeIndex={0}
      isCollapsed={false}
      onToggleCollapse={vi.fn()}
      onHoverIndex={vi.fn()}
      onSelect={vi.fn()}
      {...props}
    />,
  )

describe("PermissionRequestPanel", () => {
  afterEach(cleanup)

  it("选择态：展示工具信息与四选项，默认高亮第一项（允许）", () => {
    renderPanel()

    expect(screen.getByText("bash")).not.toBeNull()
    expect(screen.getByText("ls")).not.toBeNull()
    expect(screen.getByText("允许")).not.toBeNull()
    expect(screen.getByText("允许本次会话")).not.toBeNull()
    expect(screen.getByText("拒绝")).not.toBeNull()
    expect(screen.getByText("允许全部")).not.toBeNull()

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(4)
    expect(options[0]!.getAttribute("aria-selected")).toBe("true")
  })

  it("确认态：展示确认文案与确认/返回两选项", () => {
    renderPanel({ phase: "confirm", options: PERMISSION_CONFIRM_OPTIONS, activeIndex: 1 })

    expect(screen.getByText("允许当前对话全部工具与 MCP 不再询问？")).not.toBeNull()
    expect(screen.getByText("确认允许全部")).not.toBeNull()
    expect(screen.getByText("返回")).not.toBeNull()
    expect(screen.getAllByRole("option")).toHaveLength(2)
  })

  it("鼠标悬停触发 onHoverIndex", () => {
    const onHoverIndex = vi.fn()
    renderPanel({ onHoverIndex })

    fireEvent.mouseEnter(screen.getAllByRole("option")[2]!)
    expect(onHoverIndex).toHaveBeenCalledWith(2)
  })

  it("鼠标点击选项触发 onSelect(index)", () => {
    const onSelect = vi.fn()
    renderPanel({ onSelect })

    fireEvent.click(screen.getByText("拒绝"))
    expect(onSelect).toHaveBeenCalledWith(2)
  })

  it("isOpen=false 或 position=null 时不渲染", () => {
    const { unmount } = renderPanel({ isOpen: false })
    expect(screen.queryByRole("listbox")).toBeNull()
    unmount()

    renderPanel({ position: null })
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  it("折叠态：显示 Permission 文案，无工具名/摘要/选项与展开按钮，点击面板触发展开", () => {
    const onToggleCollapse = vi.fn()
    renderPanel({ isCollapsed: true, onToggleCollapse })

    expect(screen.getByText("Permission")).not.toBeNull()
    expect(screen.queryByText("bash")).toBeNull()
    expect(screen.queryByText("default")).toBeNull()
    expect(screen.queryByText("ls")).toBeNull()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(screen.queryByRole("button")).toBeNull()
    expect(screen.getByRole("listbox").style.height).toBe("36px")

    fireEvent.click(screen.getByRole("listbox"))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it("展开态点击折叠按钮触发 onToggleCollapse", () => {
    const onToggleCollapse = vi.fn()
    renderPanel({ onToggleCollapse })

    fireEvent.click(screen.getByRole("button", { name: "折叠权限确认" }))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })
})
