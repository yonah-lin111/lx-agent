// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { act } from "react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HeaderSideBar } from "@/components/layout/HeaderSideBar"
import { useGameSessionStore } from "@/features/game"
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
    useGameSessionStore.setState({ session: null, isOpen: false })
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

  it("展开时点击 header 外部收起，点击 header 内部不收起", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    const onExpandedChange = vi.fn()
    const view = render(
      <MemoryRouter>
        <HeaderSideBar isExpanded onExpandedChange={onExpandedChange} />
      </MemoryRouter>,
    )

    const header = view.container.querySelector("header")
    expect(header).not.toBeNull()
    fireEvent.pointerDown(header as HTMLElement)
    expect(onExpandedChange).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onExpandedChange).toHaveBeenCalledWith(false)

    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it("展开时点击 header 内触发的 tooltip 浮层不收起，Esc 不收起", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    const onExpandedChange = vi.fn()
    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded onExpandedChange={onExpandedChange} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByLabelText("Switch Theme"))
    // jsdom 无布局，气泡定位坐标为空时带 visibility:hidden，需包含隐藏元素查询。
    const bubble = screen.getByRole("tooltip", { hidden: true })
    fireEvent.pointerDown(bubble)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onExpandedChange).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onExpandedChange).toHaveBeenCalledWith(false)

    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it("游戏入口：存在进行中会话时图标变黄，点击开合覆盖层", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded={false} onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )

    const getGameButton = (): HTMLElement => screen.getByRole("button", { name: "Games" })
    expect(getGameButton().getAttribute("data-game-active")).toBeNull()
    expect(getGameButton().className).not.toContain("text-amber-400")

    act(() => {
      useGameSessionStore.getState().startBuiltin("dodge")
    })

    expect(getGameButton().getAttribute("data-game-active")).toBe("true")
    expect(getGameButton().className).toContain("text-amber-400")

    // 覆盖层处于展开态，点击后收起（最小化）但保留会话。
    fireEvent.click(getGameButton())
    expect(useGameSessionStore.getState().isOpen).toBe(false)
    expect(useGameSessionStore.getState().session).not.toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it("收起态点击外部不触发收起回调", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = api

    const onExpandedChange = vi.fn()
    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded={false} onExpandedChange={onExpandedChange} />
      </MemoryRouter>,
    )

    fireEvent.pointerDown(document.body)
    expect(onExpandedChange).not.toHaveBeenCalled()

    await new Promise((resolve) => setTimeout(resolve, 0))
  })
})
