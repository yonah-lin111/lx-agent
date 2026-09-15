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
  range: "today" as const,
  filterOptions,
  isLoading: false,
  refreshIntervalMs: 0,
  onRangeChange: vi.fn(),
  onProviderChange: vi.fn(),
  onModelChange: vi.fn(),
  onProjectChange: vi.fn(),
  onSessionChange: vi.fn(),
  onRefreshIntervalChange: vi.fn(),
  onRefresh: vi.fn(),
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
})
