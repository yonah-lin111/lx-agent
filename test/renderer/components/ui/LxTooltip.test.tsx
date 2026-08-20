// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LxTooltip } from "@/components/ui/LxTooltip"

// jsdom 未实现 ResizeObserver / requestAnimationFrame（气泡定位依赖），用空实现代替。
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

const renderTooltip = (props: Partial<Parameters<typeof LxTooltip>[0]> = {}) =>
  render(
    <LxTooltip trigger="click" content={<div>Tip 内容</div>} {...props}>
      <button type="button">触发</button>
    </LxTooltip>,
  )

describe("LxTooltip closeOnScroll / closeOnOutsideClick / minimizable", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("默认：滚动条滚动与点击外部均关闭，且默认不展示最小化 [-]", () => {
    renderTooltip()
    fireEvent.click(screen.getByText("触发"))
    expect(screen.getByText("Tip 内容")).not.toBeNull()
    expect(screen.queryByRole("button", { name: "最小化" })).toBeNull()

    fireEvent.scroll(document)
    flushCloseAnimation()
    expect(screen.queryByText("Tip 内容")).toBeNull()

    fireEvent.click(screen.getByText("触发"))
    expect(screen.getByText("Tip 内容")).not.toBeNull()
    fireEvent.mouseDown(document.body)
    flushCloseAnimation()
    expect(screen.queryByText("Tip 内容")).toBeNull()
  })

  it("closeOnScroll=false：滚动条滚动不关闭", () => {
    renderTooltip({ closeOnScroll: false })
    fireEvent.click(screen.getByText("触发"))
    fireEvent.scroll(document)
    flushCloseAnimation()
    expect(screen.getByText("Tip 内容")).not.toBeNull()
  })

  it("closeOnOutsideClick=false：点击外部不关闭", () => {
    renderTooltip({ closeOnOutsideClick: false })
    fireEvent.click(screen.getByText("触发"))
    fireEvent.mouseDown(document.body)
    flushCloseAnimation()
    expect(screen.getByText("Tip 内容")).not.toBeNull()
  })

  it("minimizable=true：右上角展示 [-] 最小化按钮，点击后关闭，且角标 svg 始终存在且父级不裁剪", () => {
    renderTooltip({ minimizable: true, closeOnScroll: false, closeOnOutsideClick: false })
    fireEvent.click(screen.getByText("触发"))
    expect(screen.getByText("Tip 内容")).not.toBeNull()
    expect(screen.getByRole("button", { name: "Collapse" })).not.toBeNull()

    const tooltip = screen.getByRole("tooltip")
    expect(tooltip.className).not.toContain("overflow-hidden")
    const arrow = tooltip.querySelector("svg")
    expect(arrow).not.toBeNull()

    // 滚动与外点均不关闭（常驻）
    fireEvent.scroll(document)
    fireEvent.mouseDown(document.body)
    flushCloseAnimation()
    expect(screen.getByText("Tip 内容")).not.toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }))
    flushCloseAnimation()
    expect(screen.queryByText("Tip 内容")).toBeNull()
  })
})
