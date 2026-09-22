// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HeaderSideBar } from "@/components/layout/HeaderSideBar"
import type { UsageSummary } from "@/features/usage/types"
import { getTodayKey, shiftDateKey } from "@/lib/date"

const summary: UsageSummary = {
  requestCount: 1,
  successCount: 1,
  errorCount: 0,
  abortedCount: 0,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 15,
  pricedRequestCount: 1,
  totalCostUsd: 0.001,
  successRate: 100,
  avgDurationMs: 100,
}

vi.mock("@/features/openclaw", () => ({
  OpenClawBreadcrumb: () => <span>工作台</span>,
}))

const createApiMock = () => ({
  schedule: {
    listByDate: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    reorder: vi.fn(),
    listRangeStats: vi.fn().mockResolvedValue([]),
  },
  usage: {
    getSummary: vi.fn().mockResolvedValue(summary),
  },
})

describe("HeaderSideBar", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("展开时渲染左侧今日待办面板与右侧今日用量面板", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )

    expect(screen.getByText("Today's To-Dos")).toBeDefined()
    expect(screen.getByText("Today's Usage")).toBeDefined()
    await waitFor(() => {
      const todayKey = getTodayKey()
      expect(api.schedule.listByDate).toHaveBeenCalledWith({ entryDate: todayKey })
      expect(api.schedule.listByDate).toHaveBeenCalledWith({
        entryDate: shiftDateKey(todayKey, -1),
      })
      expect(api.usage.getSummary).toHaveBeenCalledTimes(1)
    })
  })

  it("收起态顶部行以固定行高加主题偏移居中，不随高度动画重排", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    const collapsed = render(
      <MemoryRouter>
        <HeaderSideBar isExpanded={false} onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )
    const collapsedHeaderClasses =
      collapsed.container.querySelector("header")?.className.split(/\s+/) ?? []
    expect(collapsedHeaderClasses).toContain("py-1")
    expect(collapsedHeaderClasses).not.toContain("p-2")

    const collapsedRow = collapsed.container.querySelector("header > div")?.firstElementChild
    const collapsedRowClasses = collapsedRow?.className.split(/\s+/) ?? []
    expect(collapsedRowClasses).toContain("h-6")
    expect(collapsedRowClasses).not.toContain("h-full")
    expect(collapsedRowClasses).toContain("mt-[var(--theme-header-collapsed-row-offset-y)]")

    const expanded = render(
      <MemoryRouter>
        <HeaderSideBar isExpanded onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )
    const expandedHeaderClasses =
      expanded.container.querySelector("header")?.className.split(/\s+/) ?? []
    expect(expandedHeaderClasses).toContain("p-2")
    expect(expandedHeaderClasses).not.toContain("py-1")

    const expandedRow = expanded.container.querySelector("header > div")?.firstElementChild
    const expandedRowClasses = expandedRow?.className.split(/\s+/) ?? []
    expect(expandedRowClasses).toContain("h-6")
    expect(expandedRowClasses).not.toContain("h-full")
    expect(expandedRowClasses).not.toContain("mt-[var(--theme-header-collapsed-row-offset-y)]")

    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it("收起时不发起待办与用量查询", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded={false} onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.schedule.listByDate).not.toHaveBeenCalled()
    expect(api.usage.getSummary).not.toHaveBeenCalled()
  })

  it("OpenClaw 路由面包屑追加当前办公区，其它路由不渲染", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    const openclawView = render(
      <MemoryRouter initialEntries={["/openclaw"]}>
        <HeaderSideBar isExpanded={false} onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )
    expect(openclawView.container.textContent).toContain("工作台")
    cleanup()

    const homeView = render(
      <MemoryRouter initialEntries={["/"]}>
        <HeaderSideBar isExpanded={false} onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )
    expect(homeView.container.textContent).not.toContain("工作台")

    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
