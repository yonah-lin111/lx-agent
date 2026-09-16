// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LxDatePicker } from "@/components/ui/LxDatePicker"
import { getTodayKey, shiftDateKey } from "@/lib/date"

describe("LxDatePicker", () => {
  afterEach(cleanup)

  it("默认触发器展示当前值，点击展开 42 格月历", () => {
    render(<LxDatePicker value="2026-09-16" onChange={vi.fn()} />)

    const trigger = screen.getByRole("button", { expanded: false })
    expect(trigger.textContent).toContain("2026")

    fireEvent.click(trigger)

    expect(screen.getByRole("dialog")).toBeDefined()
    expect(document.querySelectorAll("[data-date]")).toHaveLength(42)
  })

  it("选择日期回调对应日期键", () => {
    const handleChange = vi.fn()
    render(<LxDatePicker value="2026-09-16" onChange={handleChange} />)

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(document.querySelector('[data-date="2026-09-15"]') as HTMLElement)

    expect(handleChange).toHaveBeenCalledWith("2026-09-15")
  })

  it("快捷项跳转到相对今天的日期", () => {
    const handleChange = vi.fn()
    render(<LxDatePicker value="2026-09-16" onChange={handleChange} />)

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }))

    expect(handleChange).toHaveBeenCalledWith(shiftDateKey(getTodayKey(), 1))
  })

  it("按每日条目数展示角标并向上回报可见月份", () => {
    const handleVisibleMonthChange = vi.fn()
    render(
      <LxDatePicker
        value="2026-09-16"
        entryCountMap={{ "2026-09-16": 5 }}
        onChange={vi.fn()}
        onVisibleMonthChange={handleVisibleMonthChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { expanded: false }))

    expect(document.querySelector('[data-date="2026-09-16"]')?.textContent).toContain("5")
    expect(handleVisibleMonthChange).toHaveBeenCalledWith("2026-09")
  })

  it("按月模式展示 12 个月并支持年份切换后选择", () => {
    const handleChange = vi.fn()
    render(<LxDatePicker mode="month" value="2026-09" onChange={handleChange} />)

    fireEvent.click(screen.getByRole("button", { expanded: false }))

    expect(screen.getByText("2026")).toBeDefined()
    expect(document.querySelectorAll(".lx-datepicker-month")).toHaveLength(12)

    fireEvent.click(screen.getByRole("button", { name: "Previous year" }))
    expect(screen.getByText("2025")).toBeDefined()

    fireEvent.click(document.querySelector(".lx-datepicker-month") as HTMLElement)
    expect(handleChange).toHaveBeenCalledWith("2025-01")
  })

  it("周模式选择命中所在周的周一", () => {
    const handleChange = vi.fn()
    render(<LxDatePicker mode="week" value="2026-09-14" onChange={handleChange} />)

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    // 2026-09-16 是周三，属于 2026-09-14 起的那一周。
    fireEvent.click(document.querySelector('[data-date="2026-09-16"]') as HTMLElement)

    expect(handleChange).toHaveBeenCalledWith("2026-09-14")
  })

  it("disabled 时不可展开", () => {
    render(<LxDatePicker value="2026-09-16" disabled onChange={vi.fn()} />)

    const trigger = screen.getByRole("button")
    expect((trigger as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(trigger)
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
