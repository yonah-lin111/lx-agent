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

describe("LxDatePicker range 模式", () => {
  afterEach(cleanup)

  it("触发器展示传入的预设名，展开后渲染双月历", () => {
    render(
      <LxDatePicker
        mode="range"
        rangeValue={{ startDate: "2026-09-01", endDate: "2026-09-17" }}
        presets={[{ key: "7d", label: "Last 7 days" }]}
        activePresetKey="7d"
        triggerLabel="Last 7 days"
        onRangeChange={vi.fn()}
        onPresetSelect={vi.fn()}
      />,
    )

    const trigger = screen.getByRole("button", { expanded: false })
    expect(trigger.textContent).toContain("Last 7 days")

    fireEvent.click(trigger)

    expect(screen.getByRole("dialog")).toBeDefined()
    expect(document.querySelectorAll("[data-date]")).toHaveLength(84)
    expect(document.querySelectorAll(".lx-datepicker-month-grid")).toHaveLength(2)
    // 触发器与预设同名，用类名定位预设行按钮。
    expect(document.querySelector(".lx-datepicker-quick")?.getAttribute("aria-pressed")).toBe(
      "true",
    )
  })

  it("未提供 triggerLabel 时按区间格式化触发器文案", () => {
    render(
      <LxDatePicker
        mode="range"
        rangeValue={{ startDate: "2026-09-01", endDate: "2026-09-17" }}
        onRangeChange={vi.fn()}
      />,
    )

    const trigger = screen.getByRole("button", { expanded: false })
    expect(trigger.textContent).toContain("2026")
    expect(trigger.textContent).toContain("Sep")
  })

  it("点击预设回调 key 并收起弹层", () => {
    const handlePresetSelect = vi.fn()
    render(
      <LxDatePicker
        mode="range"
        rangeValue={null}
        presets={[{ key: "all", label: "All time" }]}
        onRangeChange={vi.fn()}
        onPresetSelect={handlePresetSelect}
      />,
    )

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(screen.getByRole("button", { name: "All time" }))

    expect(handlePresetSelect).toHaveBeenCalledWith("all")
    expect(screen.getByRole("button", { expanded: false })).toBeDefined()
  })

  it("两次点击端点后回调区间", () => {
    const handleRangeChange = vi.fn()
    render(
      <LxDatePicker
        mode="range"
        rangeValue={{ startDate: "2026-09-01", endDate: "2026-09-17" }}
        onRangeChange={handleRangeChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(document.querySelector('[data-date="2026-09-20"]') as HTMLElement)
    // 首次点击只记起点，不触发确认。
    expect(handleRangeChange).not.toHaveBeenCalled()

    fireEvent.click(document.querySelector('[data-date="2026-09-25"]') as HTMLElement)
    expect(handleRangeChange).toHaveBeenCalledWith({
      startDate: "2026-09-20",
      endDate: "2026-09-25",
    })
  })

  it("终点早于起点时自动交换", () => {
    const handleRangeChange = vi.fn()
    render(
      <LxDatePicker
        mode="range"
        rangeValue={{ startDate: "2026-09-01", endDate: "2026-09-17" }}
        onRangeChange={handleRangeChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    fireEvent.click(document.querySelector('[data-date="2026-09-25"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-date="2026-09-20"]') as HTMLElement)

    expect(handleRangeChange).toHaveBeenCalledWith({
      startDate: "2026-09-20",
      endDate: "2026-09-25",
    })
  })

  it("同一日期点两次得到单日区间", () => {
    const handleRangeChange = vi.fn()
    render(
      <LxDatePicker
        mode="range"
        rangeValue={{ startDate: "2026-09-01", endDate: "2026-09-17" }}
        onRangeChange={handleRangeChange}
      />,
    )

    fireEvent.click(screen.getByRole("button", { expanded: false }))
    const target = document.querySelector('[data-date="2026-09-22"]') as HTMLElement
    fireEvent.click(target)
    fireEvent.click(target)

    expect(handleRangeChange).toHaveBeenCalledWith({
      startDate: "2026-09-22",
      endDate: "2026-09-22",
    })
  })
})
