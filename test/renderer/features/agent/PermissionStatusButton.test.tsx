// @vitest-environment jsdom

import type { PermissionRequest } from "@shared/contracts/agent"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PermissionStatusButton } from "@/features/agent/components/PermissionStatusButton"

// jsdom 未实现 ResizeObserver / requestAnimationFrame（LxTooltip 定位依赖），用空实现代替。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", (() => 0) as typeof requestAnimationFrame)

// tooltip 关闭有 120ms 退场动画，用假定时器推进后内容才卸载。
const flushCloseAnimation = (): void => {
  act(() => {
    vi.advanceTimersByTime(200)
  })
}

const request: PermissionRequest = {
  requestId: "r1",
  toolName: "bash",
  args: { command: "ls" },
  summary: "ls",
  mode: "default",
  sessionId: "s1",
}

const renderButton = () => {
  const onRespond = vi.fn()
  render(<PermissionStatusButton request={request} onRespond={onRespond} />)
  return { onRespond }
}

const optionCount = () => screen.getAllByRole("option").length

describe("PermissionStatusButton", () => {
  afterEach(cleanup)

  it("无请求时不渲染", () => {
    const { container } = render(<PermissionStatusButton request={null} onRespond={vi.fn()} />)
    expect(container.querySelector('[aria-label="权限确认"]')).toBeNull()
  })

  it("请求到达自动展开：展示工具名/mode 与选择态六选项", () => {
    renderButton()
    expect(screen.getByText("bash")).not.toBeNull()
    expect(screen.getByText("default")).not.toBeNull()
    for (const label of ["允许", "允许本次会话", "永久允许", "拒绝", "永久拒绝", "允许全部"]) {
      expect(screen.getByText(label)).not.toBeNull()
    }
    expect(optionCount()).toBe(6)
    expect(screen.getAllByRole("option")[0]!.getAttribute("aria-selected")).toBe("true")
  })

  it("鼠标悬停高亮，点击选中触发 onRespond", () => {
    const { onRespond } = renderButton()
    fireEvent.mouseEnter(screen.getByText("拒绝"))
    expect(screen.getAllByRole("option")[3]!.getAttribute("aria-selected")).toBe("true")
    fireEvent.click(screen.getByText("拒绝"))
    expect(onRespond).toHaveBeenCalledWith("deny")
    fireEvent.click(screen.getByText("允许本次会话"))
    expect(onRespond).toHaveBeenCalledWith("allow", true)
  })

  it("键盘 ↑↓ 切换、Enter 确认", () => {
    const { onRespond } = renderButton()
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(screen.getAllByRole("option")[1]!.getAttribute("aria-selected")).toBe("true")
    fireEvent.keyDown(document, { key: "Enter" })
    expect(onRespond).toHaveBeenCalledWith("allow", true)
  })

  it("点击允许全部进入确认态，确认后触发允许全部", () => {
    const { onRespond } = renderButton()
    fireEvent.click(screen.getByText("允许全部"))
    expect(
      screen.getByText("Allow all tools and MCP in current chat without asking?"),
    ).not.toBeNull()
    expect(screen.getByText("确认允许全部")).not.toBeNull()
    expect(screen.queryByText("允许本次会话")).toBeNull()
    fireEvent.click(screen.getByText("确认允许全部"))
    expect(onRespond).toHaveBeenCalledWith("allow", false, true)
  })

  it("确认态返回回到选择态，保留允许全部高亮", () => {
    renderButton()
    fireEvent.click(screen.getByText("允许全部"))
    fireEvent.click(screen.getByText("返回"))
    expect(optionCount()).toBe(6)
    expect(screen.getAllByRole("option")[5]!.getAttribute("aria-selected")).toBe("true")
  })

  it("Esc 最小化：收起 tooltip，请求仍挂起且 icon 可重新展开", () => {
    vi.useFakeTimers()
    renderButton()
    fireEvent.keyDown(document, { key: "Escape" })
    flushCloseAnimation()
    expect(screen.queryByText("允许")).toBeNull()
    fireEvent.click(screen.getByLabelText("Permission Confirmation"))
    expect(screen.getByText("允许")).not.toBeNull()
    vi.useRealTimers()
  })
})
