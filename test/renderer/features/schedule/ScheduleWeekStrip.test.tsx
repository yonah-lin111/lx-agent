// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScheduleWeekStrip } from "@/features/schedule/components/ScheduleWeekStrip"

afterEach(() => {
  cleanup()
})

describe("ScheduleWeekStrip", () => {
  it("渲染所在周的 7 天并响应日期切换", () => {
    const handleSelectDate = vi.fn()
    render(
      <ScheduleWeekStrip
        selectedDate="2026-09-16"
        onSelectDate={handleSelectDate}
        statsMap={{
          "2026-09-16": { plannedCount: 3, completedCount: 1 },
        }}
      />,
    )

    // 2026-09-16 所在周为 14-20 日
    expect(screen.getByText("14")).toBeDefined()
    expect(screen.getByText("16")).toBeDefined()
    expect(screen.getByText("20")).toBeDefined()

    // 点击 14 日
    fireEvent.click(screen.getByText("14"))
    expect(handleSelectDate).toHaveBeenCalledWith("2026-09-14")
  })

  it("点击上周 / 下周按钮触发对应周偏移", () => {
    const handleSelectDate = vi.fn()
    render(<ScheduleWeekStrip selectedDate="2026-09-16" onSelectDate={handleSelectDate} />)

    // 上一周 (2026-09-16 - 7天 = 2026-09-09)
    const prevButton = screen.getByRole("button", { name: /previous week|上一周/i })
    fireEvent.click(prevButton)
    expect(handleSelectDate).toHaveBeenCalledWith("2026-09-09")

    // 下一周 (2026-09-16 + 7天 = 2026-09-23)
    const nextButton = screen.getByRole("button", { name: /next week|下一周/i })
    fireEvent.click(nextButton)
    expect(handleSelectDate).toHaveBeenCalledWith("2026-09-23")
  })
})
