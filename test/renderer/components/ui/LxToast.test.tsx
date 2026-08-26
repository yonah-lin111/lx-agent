// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  LxAgentInputToast,
  LxBreadcrumbToast,
  LxToastProvider,
  useLxAgentToast,
  useLxToast,
} from "@/components/ui/LxToast"

const TestToastComponent = (): React.JSX.Element => {
  const toast = useLxToast()
  const agentToast = useLxAgentToast()

  return (
    <div>
      <LxBreadcrumbToast />
      <LxAgentInputToast />
      <button type="button" onClick={() => toast.success("全局提示", 3000, "top-center")}>
        触发全局
      </button>
      <button type="button" onClick={() => toast.success("面包屑提示", 3000, "breadcrumb")}>
        触发面包屑
      </button>
      <button type="button" onClick={() => agentToast.success("Agent成功提示")}>
        触发Agent成功
      </button>
      <button type="button" onClick={() => agentToast.error("Agent失败提示")}>
        触发Agent失败
      </button>
      <button type="button" onClick={() => agentToast.warning("Agent警告提示")}>
        触发Agent警告
      </button>
    </div>
  )
}

describe("LxToast", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("LxAgentInputToast 能够正确渲染 agent-input 方位的消息并带对应类型样式", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    expect(screen.queryByText("Agent成功提示")).toBeNull()

    fireEvent.click(screen.getByText("触发Agent成功"))
    const toastEl = screen.getByText("Agent成功提示")
    expect(toastEl).not.toBeNull()
    const containerEl = toastEl.closest(".lx-agent-input-toast")
    expect(containerEl).not.toBeNull()
    expect(containerEl?.getAttribute("data-toast-type")).toBe("success")
    expect(containerEl?.className).toContain("text-emerald-400")

    // 持续时间后退出并移除
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(containerEl?.className).toContain("animate-toast-out")

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText("Agent成功提示")).toBeNull()
  })

  it("useLxAgentToast 能够正确分发 error 与 warning 类型的 agent-input 提示", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发Agent失败"))
    let toastEl = screen.getByText("Agent失败提示")
    expect(toastEl.closest(".lx-agent-input-toast")?.getAttribute("data-toast-type")).toBe("error")
    expect(toastEl.closest(".lx-agent-input-toast")?.className).toContain("text-rose-400")

    fireEvent.click(screen.getByText("触发Agent警告"))
    toastEl = screen.getByText("Agent警告提示")
    expect(toastEl.closest(".lx-agent-input-toast")?.getAttribute("data-toast-type")).toBe(
      "warning",
    )
    expect(toastEl.closest(".lx-agent-input-toast")?.className).toContain("text-amber-400")
  })

  it("LxBreadcrumbToast 与 LxAgentInputToast 各自独立展示互不干扰", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发面包屑"))
    fireEvent.click(screen.getByText("触发Agent成功"))

    const breadcrumbToast = screen.getByText("面包屑提示")
    const agentToast = screen.getByText("Agent成功提示")

    expect(breadcrumbToast.closest(".lx-breadcrumb-toast")).not.toBeNull()
    expect(agentToast.closest(".lx-agent-input-toast")).not.toBeNull()
  })

  it("LxAgentInputToast 外层容器具有绝对定位与点击穿透属性", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发Agent成功"))
    const toastEl = screen.getByText("Agent成功提示")
    const wrapperEl = toastEl.parentElement
    expect(wrapperEl?.className).toContain("absolute")
    expect(wrapperEl?.className).toContain("bottom-full")
    expect(wrapperEl?.className).toContain("pointer-events-none")
  })
})
