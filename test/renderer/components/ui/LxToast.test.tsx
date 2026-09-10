// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  LxAgentInputToast,
  LxAgentTopToast,
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
      <LxAgentTopToast />
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

  it("LxAgentTopToast 能够正确渲染 agent-top 方位的消息并带对应类型样式", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    expect(screen.queryByText("Agent成功提示")).toBeNull()

    fireEvent.click(screen.getByText("触发Agent成功"))
    const toastEl = screen.getByText("Agent成功提示")
    expect(toastEl).not.toBeNull()
    const containerEl = toastEl.closest(".lx-agent-top-toast")
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

  it("useLxAgentToast 能够正确分发 error 与 warning 类型的 agent-top 提示", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发Agent失败"))
    let toastEl = screen.getByText("Agent失败提示")
    expect(toastEl.closest(".lx-agent-top-toast")?.getAttribute("data-toast-type")).toBe("error")
    expect(toastEl.closest(".lx-agent-top-toast")?.className).toContain("text-rose-400")

    fireEvent.click(screen.getByText("触发Agent警告"))
    toastEl = screen.getByText("Agent警告提示")
    expect(toastEl.closest(".lx-agent-top-toast")?.getAttribute("data-toast-type")).toBe("warning")
    expect(toastEl.closest(".lx-agent-top-toast")?.className).toContain("text-amber-400")
  })

  it("LxBreadcrumbToast 与 LxAgentTopToast 各自独立展示互不干扰", () => {
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
    expect(agentToast.closest(".lx-agent-top-toast")).not.toBeNull()
  })

  it("LxAgentTopToast 外层容器具有绝对定位、顶部对齐与点击穿透属性", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发Agent成功"))
    const toastEl = screen.getByText("Agent成功提示")
    const wrapperEl = toastEl.parentElement
    expect(wrapperEl?.className).toContain("absolute")
    expect(wrapperEl?.className).toContain("top-2")
    expect(wrapperEl?.className).toContain("pointer-events-none")
    expect(wrapperEl?.className).toContain("w-[min(calc(100%-1.5rem),48rem)]")
    expect(wrapperEl?.className).toContain("max-w-[min(calc(100%-1.5rem),48rem)]")
  })

  it("兼容旧别名 LxAgentInputToast 正常导出且渲染一致", () => {
    expect(LxAgentInputToast).toBe(LxAgentTopToast)
  })

  it("LxBreadcrumbToast 保持单行截断，而全局 Toast 与 LxAgentTopToast 支持换行显示", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发面包屑"))
    fireEvent.click(screen.getByText("触发全局"))
    fireEvent.click(screen.getByText("触发Agent成功"))

    const breadcrumbToast = screen.getByText("面包屑提示").closest(".lx-breadcrumb-toast")
    const globalToast = screen.getByText("全局提示").closest(".lx-toast-item")
    const agentToast = screen.getByText("Agent成功提示").closest(".lx-agent-top-toast")

    // 面包屑 Toast 必须保持单行截断
    expect(breadcrumbToast?.className).toContain("whitespace-nowrap")
    expect(breadcrumbToast?.className).toContain("truncate")

    // 全局与 Agent Toast 支持换行显示，不得存在 truncate
    expect(globalToast?.className).toContain("break-words")
    expect(globalToast?.className).toContain("whitespace-pre-wrap")
    expect(globalToast?.className).not.toContain("truncate")

    expect(agentToast?.className).toContain("break-words")
    expect(agentToast?.className).toContain("whitespace-pre-wrap")
    expect(agentToast?.className).not.toContain("truncate")
  })

  it("Toast 支持文本复制（select-text）与鼠标 hover 保持显示、leave 后恢复倒计时退出", () => {
    render(
      <LxToastProvider>
        <TestToastComponent />
      </LxToastProvider>,
    )

    fireEvent.click(screen.getByText("触发Agent成功"))
    const toastEl = screen.getByText("Agent成功提示")
    const containerEl = toastEl.closest(".lx-agent-top-toast") as HTMLElement

    // 检查可复制和响应指针事件
    expect(containerEl.className).toContain("select-text")
    expect(containerEl.className).toContain("pointer-events-auto")
    expect(containerEl.className).not.toContain("select-none")

    // 在接近 3000ms 时触发 hover (如 2500ms)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    fireEvent.mouseEnter(containerEl)

    // 在 hover 状态下即使再推进 5000ms 也不应退出
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText("Agent成功提示")).not.toBeNull()
    expect(containerEl.className).not.toContain("animate-toast-out")

    // 鼠标移出后，触发恢复倒计时
    fireEvent.mouseLeave(containerEl)

    // 恢复计时后再走完 3000ms 触发退场动画
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(containerEl.className).toContain("animate-toast-out")

    // 退场动画 300ms 完成后卸载
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(screen.queryByText("Agent成功提示")).toBeNull()
  })
})
