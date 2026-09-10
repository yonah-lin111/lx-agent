// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
  it("正确渲染今日统计说明简报内容", () => {
    render(
      <OverviewSummaryCard
        timeRange="today"
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

    // 标题与 Badge
    expect(screen.getByText(/今日数据统计说明|Today's Statistics Summary/i)).toBeDefined()
    expect(screen.getAllByText(/今日|Today/i).length).toBeGreaterThanOrEqual(1)

    // 细分指标数值
    expect(screen.getByText("12")).toBeDefined()
    expect(screen.getByText("34")).toBeDefined()
    expect(screen.getByText("95%")).toBeDefined()
    expect(screen.getByText("350")).toBeDefined()
  })

  it("当切换为 7 天或其他时间范围时展示对应标题", () => {
    render(
      <OverviewSummaryCard
        timeRange="7d"
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

    expect(screen.getAllByText(/近 7 天|Last 7 Days/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("50")).toBeDefined()
    expect(screen.getByText("100")).toBeDefined()
  })

  it("点击时间跨度 Select 触发 onTimeRangeChange", () => {
    const onTimeRangeChange = vi.fn()
    render(<OverviewSummaryCard timeRange="today" onTimeRangeChange={onTimeRangeChange} />)

    // 打开下拉框
    const trigger = screen.getByRole("button")
    fireEvent.click(trigger)

    // 点击 7 天选项
    const option7d = screen.getByText(/近 7 天|Last 7 Days/)
    fireEvent.mouseDown(option7d)

    expect(onTimeRangeChange).toHaveBeenCalledWith("7d")
  })
})
