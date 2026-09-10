// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OverviewSummaryCard } from "@/features/overview/components/OverviewSummaryCard"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

afterEach(() => {
  cleanup()
})

describe("OverviewSummaryCard", () => {
  it("正确渲染统计说明简报文本与细分指标", () => {
    const { container } = render(
      <OverviewSummaryCard
        periodSummary={{
          range: "today",
          turns: 12,
          toolCalls: 34,
          toolSuccessRate: 95,
          toolAvgDurationMs: 350,
          sessionCount: 3,
        }}
      />,
    )

    // 细分指标数值
    expect(screen.getByText("12")).toBeDefined()
    expect(screen.getByText("34")).toBeDefined()
    expect(screen.getByText("95%")).toBeDefined()
    expect(screen.getByText("350")).toBeDefined()

    // 实体背景与边框校验
    const card = container.querySelector(".overview-summary-card")
    expect(card).toBeDefined()
    expect(card?.className).toContain("bg-[#1e1e1e]")
    expect(card?.className).toContain("border-[#333333]")
  })

  it("当切换不同统计数据时正确更新数值展示", () => {
    render(
      <OverviewSummaryCard
        periodSummary={{
          range: "7d",
          turns: 50,
          toolCalls: 100,
          toolSuccessRate: 100,
          toolAvgDurationMs: 210,
          sessionCount: 8,
        }}
      />,
    )

    expect(screen.getByText("50")).toBeDefined()
    expect(screen.getByText("100")).toBeDefined()
    expect(screen.getByText("210")).toBeDefined()
  })
})
