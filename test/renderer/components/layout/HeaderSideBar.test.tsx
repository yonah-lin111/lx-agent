// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HeaderSideBar } from "@/components/layout/HeaderSideBar"

const createApiMock = () => ({
  listByDate: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reorder: vi.fn(),
  listRangeStats: vi.fn().mockResolvedValue([]),
})

describe("HeaderSideBar", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("展开时渲染左侧今日待办面板与右侧 children 容器", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded onExpandedChange={vi.fn()}>
          <div data-testid="header-right-slot">right content</div>
        </HeaderSideBar>
      </MemoryRouter>,
    )

    expect(screen.getByText("Today's To-Dos")).toBeDefined()
    expect(screen.getByTestId("header-right-slot")).toBeDefined()
    await waitFor(() => {
      expect(api.listByDate).toHaveBeenCalledTimes(1)
    })
  })

  it("收起时不发起待办查询", async () => {
    const api = createApiMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(
      <MemoryRouter>
        <HeaderSideBar isExpanded={false} onExpandedChange={vi.fn()} />
      </MemoryRouter>,
    )

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(api.listByDate).not.toHaveBeenCalled()
  })
})
