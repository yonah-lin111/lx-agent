// @vitest-environment jsdom

import type { ScheduleItem } from "@shared/contracts/schedule"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HeaderSchedulePanel } from "@/features/schedule/components/HeaderSchedulePanel"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const toLocalDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const todayKey = toLocalDateKey(new Date())

const createItem = (patch: Partial<ScheduleItem>): ScheduleItem => ({
  id: 1,
  entryDate: todayKey,
  content: "写方案",
  priority: "P1",
  completed: false,
  completedDate: null,
  sortOrder: 0,
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-19T00:00:00.000Z",
  ...patch,
})

// 内存版服务端：写操作改变 listByDate 的返回，模拟真实回读。
const createServerMock = (seed: ScheduleItem[] = []) => {
  let items = seed
  let nextId = 100
  return {
    listByDate: vi.fn(async () => items),
    create: vi.fn(async (input: { content: string; priority?: ScheduleItem["priority"] }) => {
      const created = createItem({ id: nextId++, content: input.content, priority: input.priority })
      items = [created, ...items]
      return created
    }),
    update: vi.fn(async (input: { id: number } & Partial<ScheduleItem>) => {
      const current = items.find((item) => item.id === input.id) ?? createItem({ id: input.id })
      const updated = { ...current, ...input }
      items = items.map((item) => (item.id === input.id ? updated : item))
      return updated
    }),
    remove: vi.fn(async (id: number) => {
      items = items.filter((item) => item.id !== id)
    }),
    reorder: vi.fn().mockResolvedValue(undefined),
    listRangeStats: vi.fn().mockResolvedValue([]),
  }
}

const renderPanel = (isExpanded = true): void => {
  render(<HeaderSchedulePanel isExpanded={isExpanded} />)
}

describe("HeaderSchedulePanel", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("空列表展示空态文案", async () => {
    const api = createServerMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()

    await waitFor(() => {
      expect(screen.getByText("No to-dos for today")).toBeDefined()
    })
    expect(api.listByDate).toHaveBeenCalledWith({ entryDate: todayKey })
  })

  it("输入框回车创建今天的待办并置顶展示", async () => {
    const api = createServerMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    await waitFor(() => {
      expect(screen.getByText("No to-dos for today")).toBeDefined()
    })

    const input = screen.getByPlaceholderText("Add a task, press Enter to save")
    fireEvent.change(input, { target: { value: "Write report" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith({
        entryDate: todayKey,
        content: "Write report",
        priority: "P1",
      })
    })
    expect(await screen.findByText("Write report")).toBeDefined()
  })

  it("勾选行更新完成状态", async () => {
    const api = createServerMock([createItem({ id: 1, content: "写方案" })])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    fireEvent.click(await screen.findByRole("checkbox", { name: "Mark as done" }))

    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith({ id: 1, completed: true })
    })
  })

  it("删除需要二次确认，确认后从列表移除", async () => {
    const api = createServerMock([createItem({ id: 1, content: "写方案" })])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    fireEvent.click(await screen.findByRole("button", { name: "Delete task" }))
    // jsdom 无法测量浮层坐标，气泡带 visibility:hidden，故用 label 查询而非 role 查询。
    fireEvent.click(await screen.findByLabelText("Confirm"))

    await waitFor(() => {
      expect(api.remove).toHaveBeenCalledWith(1)
    })
    await waitFor(() => {
      expect(screen.queryByText("写方案")).toBeNull()
    })
  })

  it("加载失败展示错误文案", async () => {
    const api = createServerMock()
    api.listByDate.mockRejectedValue(new Error("boom"))
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()

    await waitFor(() => {
      expect(screen.getByText("Failed to load schedule")).toBeDefined()
    })
  })

  it("收起状态下不发起查询", async () => {
    const api = createServerMock()
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel(false)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(api.listByDate).not.toHaveBeenCalled()
  })
})
