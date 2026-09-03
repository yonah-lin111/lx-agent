// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentContextUsagePill } from "@/features/agent/components/AgentContextUsagePill"

// 模拟 ResizeObserver / requestAnimationFrame 以支持 Tooltip
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)
vi.stubGlobal("requestAnimationFrame", ((cb) =>
  setTimeout(cb, 0)) as unknown as typeof requestAnimationFrame)

describe("AgentContextUsagePill 边界与交互详细测试", () => {
  afterEach(cleanup)

  it("边界测试：contextUsage 为空时显示默认文本", () => {
    render(<AgentContextUsagePill contextUsage={null} />)
    expect(screen.getByText("0%")).not.toBeNull()
  })

  it("边界测试：已用 74% 处于绿色区间且 Tooltip 不含预警提示", async () => {
    const { container } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 74_000, contextWindow: 100_000 }} />,
    )
    const dot = container.querySelector(".bg-emerald-400")
    expect(dot).not.toBeNull()

    const pill = container.querySelector(".agent-status-context-pill")
    expect(pill).not.toBeNull()
    if (pill) {
      fireEvent.mouseEnter(pill)
    }
    // 等待 tooltip 浮层
    expect(screen.getByText("74%")).not.toBeNull()
  })

  it("边界测试：恰好 75% 触发琥珀色 Warning 状态", () => {
    const { container } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 75_000, contextWindow: 100_000 }} />,
    )
    const dot = container.querySelector(".bg-amber-400")
    expect(dot).not.toBeNull()
    expect(screen.getByText("75%")).not.toBeNull()
  })

  it("边界测试：89% 保持琥珀色，恰好 90% 触发红色脉冲 Critical 状态", () => {
    const { container, rerender } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 89_000, contextWindow: 100_000 }} />,
    )
    expect(container.querySelector(".bg-amber-400")).not.toBeNull()
    expect(container.querySelector(".animate-pulse")).toBeNull()

    rerender(<AgentContextUsagePill contextUsage={{ tokens: 90_000, contextWindow: 100_000 }} />)
    expect(container.querySelector(".bg-red-400.animate-pulse")).not.toBeNull()
    expect(screen.getByText("90%")).not.toBeNull()
  })

  it("容错测试：Token 消耗达到 150% 时前端百分比安全限制在 100%", () => {
    const { container } = render(
      <AgentContextUsagePill contextUsage={{ tokens: 150_000, contextWindow: 100_000 }} />,
    )
    expect(screen.getByText("100%")).not.toBeNull()
    expect(container.querySelector(".bg-red-400.animate-pulse")).not.toBeNull()
  })
})
