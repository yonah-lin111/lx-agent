// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { UsageFilters } from "@/features/usage/components/UsageFilters"
import type { UsageFilterOptions } from "@/features/usage/types"

const filterOptions: UsageFilterOptions = {
  providers: ["anthropic"],
  models: ["m1"],
  projects: [{ id: "p1", name: "Alpha" }],
  sessions: [
    { id: "s1", name: "修复登录 bug" },
    { id: "s2", name: "sess-bet" },
  ],
}

const createProps = (overrides: Partial<Parameters<typeof UsageFilters>[0]> = {}) => ({
  rangeSelection: { preset: "today" } as const,
  filterOptions,
  refreshIntervalMs: 0,
  onRangeSelectionChange: vi.fn(),
  onProviderChange: vi.fn(),
  onModelChange: vi.fn(),
  onProjectChange: vi.fn(),
  onSessionChange: vi.fn(),
  onRefreshIntervalChange: vi.fn(),
  ...overrides,
})

describe("UsageFilters", () => {
  afterEach(cleanup)

  it("默认展示全部会话并渲染会话候选", () => {
    render(<UsageFilters {...createProps()} />)

    const trigger = screen.getByRole("button", { name: /All Sessions|全部会话/ })
    fireEvent.click(trigger)

    expect(screen.getByRole("option", { name: "修复登录 bug" })).toBeDefined()
    expect(screen.getByRole("option", { name: "sess-bet" })).toBeDefined()
  })

  it("选择会话回调 sessionId", () => {
    const onSessionChange = vi.fn()
    render(<UsageFilters {...createProps({ onSessionChange })} />)

    fireEvent.click(screen.getByRole("button", { name: /All Sessions|全部会话/ }))
    fireEvent.mouseDown(screen.getByRole("option", { name: "sess-bet" }))

    expect(onSessionChange).toHaveBeenCalledWith("s2")
  })

  it("选回全部会话回调 undefined", () => {
    const onSessionChange = vi.fn()
    render(<UsageFilters {...createProps({ sessionId: "s1", onSessionChange })} />)

    // 已选会话作为触发器标签。
    fireEvent.click(screen.getByRole("button", { name: "修复登录 bug" }))
    fireEvent.mouseDown(screen.getByRole("option", { name: /All Sessions|全部会话/ }))

    expect(onSessionChange).toHaveBeenCalledWith(undefined)
  })

  it("时间范围控件展示预设名并展开双月历与预设行", () => {
    render(<UsageFilters {...createProps()} />)

    const trigger = document.querySelector(".lx-datepicker-trigger") as HTMLElement
    expect(trigger.textContent).toMatch(/Today|今日/)

    fireEvent.click(trigger)

    expect(document.querySelectorAll(".lx-datepicker-month-grid")).toHaveLength(2)
    expect(screen.getByRole("button", { name: /Last 7 days|近 7 天/ })).toBeDefined()
    expect(screen.getByRole("button", { name: /All time|全部时间/ })).toBeDefined()
  })

  it("选择时间预设回调预设选择", () => {
    const onRangeSelectionChange = vi.fn()
    render(<UsageFilters {...createProps({ onRangeSelectionChange })} />)

    fireEvent.click(document.querySelector(".lx-datepicker-trigger") as HTMLElement)
    fireEvent.click(screen.getByRole("button", { name: /Last 7 days|近 7 天/ }))

    expect(onRangeSelectionChange).toHaveBeenCalledWith({ preset: "7d" })
  })

  it("选择自定义区间回调 custom 选择", () => {
    const onRangeSelectionChange = vi.fn()
    render(
      <UsageFilters
        {...createProps({
          rangeSelection: { preset: "custom", startDate: "2026-09-01", endDate: "2026-09-17" },
          onRangeSelectionChange,
        })}
      />,
    )

    fireEvent.click(document.querySelector(".lx-datepicker-trigger") as HTMLElement)
    // 区间端点：先点起点再点终点。
    fireEvent.click(document.querySelector('[data-date="2026-09-20"]') as HTMLElement)
    fireEvent.click(document.querySelector('[data-date="2026-09-25"]') as HTMLElement)

    expect(onRangeSelectionChange).toHaveBeenCalledWith({
      preset: "custom",
      startDate: "2026-09-20",
      endDate: "2026-09-25",
    })
  })
})
