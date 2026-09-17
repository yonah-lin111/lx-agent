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

  it("showIcon 默认展示日历图标，关闭后仅保留展开箭头", () => {
    render(<LxDatePicker value="2026-09-16" onChange={vi.fn()} />)
    expect(document.querySelectorAll(".lx-datepicker-trigger svg")).toHaveLength(2)
    expect(document.querySelector(".lx-datepicker-trigger-icon")).not.toBeNull()
    cleanup()

    render(<LxDatePicker value="2026-09-16" showIcon={false} onChange={vi.fn()} />)
    expect(document.querySelectorAll(".lx-datepicker-trigger svg")).toHaveLength(1)
    expect(document.querySelector(".lx-datepicker-trigger-icon")).toBeNull()
  })
})

describe("LxDatePicker 尺寸档位", () => {
  afterEach(cleanup)

  it("默认 medium 档保持既有触发器与图标尺寸", () => {
    render(<LxDatePicker value="2026-09-16" onChange={vi.fn()} />)

    expect(document.querySelector(".lx-datepicker-trigger")?.className).toContain("h-7")
    expect(document.querySelector(".lx-datepicker-trigger-icon")?.getAttribute("class")).toContain(
      "h-3.5 w-3.5",
    )
  })

  it("small / large 档同步缩放触发器、图标与切换按钮", () => {
    render(<LxDatePicker value="2026-09-16" size="small" showNavButtons onChange={vi.fn()} />)
    expect(document.querySelector(".lx-datepicker-trigger")?.className).toContain("h-6")
    expect(document.querySelector(".lx-datepicker-trigger-icon")?.getAttribute("class")).toContain(
      "h-3 w-3",
    )
    expect(document.querySelector(".lx-datepicker-nav-button")?.className).toContain("h-6 w-6")
    cleanup()

    render(<LxDatePicker value="2026-09-16" size="large" showNavButtons onChange={vi.fn()} />)
    expect(document.querySelector(".lx-datepicker-trigger")?.className).toContain("h-8")
    expect(document.querySelector(".lx-datepicker-trigger-icon")?.getAttribute("class")).toContain(
      "h-4 w-4",
    )
    expect(document.querySelector(".lx-datepicker-nav-button")?.className).toContain("h-8 w-8")
  })
})

describe("LxDatePicker 两侧切换按钮", () => {
  afterEach(cleanup)

  it("默认不渲染，开启后按天平移当前值", () => {
    const handleChange = vi.fn()
    render(<LxDatePicker value="2026-09-16" onChange={handleChange} />)
    expect(screen.queryByLabelText("Previous day")).toBeNull()
    cleanup()

    render(<LxDatePicker value="2026-09-16" showNavButtons onChange={handleChange} />)
    expect(screen.getByLabelText("Previous day")).toBeDefined()

    fireEvent.click(screen.getByLabelText("Next day"))
    expect(handleChange).toHaveBeenCalledWith("2026-09-17")
    fireEvent.click(screen.getByLabelText("Previous day"))
    expect(handleChange).toHaveBeenCalledWith("2026-09-15")
  })

  it("周模式按周平移，月模式按月平移", () => {
    const handleWeekChange = vi.fn()
    render(
      <LxDatePicker mode="week" value="2026-09-14" showNavButtons onChange={handleWeekChange} />,
    )
    fireEvent.click(screen.getByLabelText("Next week"))
    expect(handleWeekChange).toHaveBeenCalledWith("2026-09-21")
    cleanup()

    const handleMonthChange = vi.fn()
    render(
      <LxDatePicker mode="month" value="2026-09" showNavButtons onChange={handleMonthChange} />,
    )
    fireEvent.click(screen.getByLabelText("Next month"))
    expect(handleMonthChange).toHaveBeenCalledWith("2026-10")
  })

  it("区间模式不渲染切换按钮", () => {
    render(<LxDatePicker mode="range" rangeValue={null} showNavButtons onRangeChange={vi.fn()} />)

    expect(screen.queryByLabelText("Previous day")).toBeNull()
    expect(screen.queryByLabelText("Next day")).toBeNull()
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
