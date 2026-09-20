// @vitest-environment jsdom

import type { ScheduleItem } from "@shared/contracts/schedule"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HeaderSchedulePanel } from "@/features/schedule/components/HeaderSchedulePanel"
import { shiftDateKey } from "@/lib/date"

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
const yesterdayKey = shiftDateKey(todayKey, -1)

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
    listByDate: vi.fn(async ({ entryDate }: { entryDate: string }) =>
      items.filter((item) => item.entryDate === entryDate),
    ),
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

  it("状态过滤切换：待完成 / 已完成", async () => {
    const api = createServerMock([
      createItem({ id: 1, content: "Pending task" }),
      createItem({ id: 2, content: "Done task", completed: true }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    await screen.findByText("Pending task")
    expect(screen.getByText("Done task")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Pending" }))
    expect(screen.queryByText("Done task")).toBeNull()
    expect(screen.getByText("Pending task")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.queryByText("Pending task")).toBeNull()
    expect(screen.getByText("Done task")).toBeDefined()

    fireEvent.click(screen.getByRole("button", { name: "All" }))
    expect(screen.getByText("Pending task")).toBeDefined()
    expect(screen.getByText("Done task")).toBeDefined()
  })

  it("过滤无结果时展示无匹配文案", async () => {
    const api = createServerMock([createItem({ id: 2, content: "Done task", completed: true })])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    await screen.findByText("Done task")

    fireEvent.click(screen.getByRole("button", { name: "Pending" }))

    expect(screen.getByText("No matching to-dos")).toBeDefined()
  })

  it("勾选完成不重排列表：条目保持原位", async () => {
    const api = createServerMock([
      createItem({ id: 1, content: "First task" }),
      createItem({ id: 2, content: "Second task" }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    await screen.findByText("First task")

    const rowTexts = (): string[] =>
      Array.from(document.querySelectorAll(".lx-schedule-item")).map(
        (row) => row.querySelector("button[data-variant='ghost']")?.textContent ?? "",
      )
    expect(rowTexts()).toEqual(["First task", "Second task"])

    fireEvent.click(screen.getAllByRole("checkbox", { name: "Mark as done" })[0])

    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith({ id: 1, completed: true })
    })
    expect(rowTexts()).toEqual(["First task", "Second task"])
  })

  it("优先级重排按钮持久化排序后的 id 顺序", async () => {
    const api = createServerMock([
      createItem({ id: 1, content: "Low", priority: "P2" }),
      createItem({ id: 2, content: "High", priority: "P0" }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    await screen.findByText("Low")

    fireEvent.click(screen.getByRole("button", { name: "Sort by priority" }))

    await waitFor(() => {
      expect(api.reorder).toHaveBeenCalledWith({ entryDate: todayKey, ids: [2, 1] })
    })
  })

  it("昨日有未完成待办时显示顺延按钮，悬停展示数量", async () => {
    const api = createServerMock([
      createItem({ id: 1, entryDate: yesterdayKey, content: "Yesterday pending" }),
      createItem({ id: 2, entryDate: yesterdayKey, content: "Yesterday done", completed: true }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    const rolloverButton = await screen.findByRole("button", { name: "Move to Today" })

    fireEvent.mouseEnter(rolloverButton)

    await waitFor(() => {
      expect(screen.getByText("1 incomplete task(s) from yesterday")).toBeDefined()
    })
    expect(screen.getByText("Move to Today")).toBeDefined()
  })

  it("昨日无未完成待办时不渲染顺延按钮", async () => {
    const api = createServerMock([
      createItem({ id: 1, entryDate: yesterdayKey, content: "Yesterday done", completed: true }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    await screen.findByText("No to-dos for today")

    await waitFor(() => {
      expect(api.listByDate).toHaveBeenCalledWith({ entryDate: yesterdayKey })
    })
    expect(screen.queryByRole("button", { name: "Move to Today" })).toBeNull()
  })

  it("点击顺延按钮把昨日未完成项移动到今天并刷新列表", async () => {
    const api = createServerMock([
      createItem({ id: 11, entryDate: yesterdayKey, content: "昨日未完成" }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    fireEvent.click(await screen.findByRole("button", { name: "Move to Today" }))

    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith({ id: 11, entryDate: todayKey })
    })
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Move to Today" })).toBeNull()
    })
    expect(await screen.findByText("昨日未完成")).toBeDefined()
  })

  it("顺延请求进行中按钮禁用", async () => {
    const api = createServerMock([
      createItem({ id: 21, entryDate: yesterdayKey, content: "昨日未完成" }),
    ])
    let resolveUpdate: (() => void) | null = null
    api.update.mockImplementation(
      (input) =>
        new Promise<ScheduleItem>((resolve) => {
          resolveUpdate = (): void =>
            resolve(createItem({ id: input.id, entryDate: todayKey, content: "昨日未完成" }))
        }),
    )
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel()
    const rolloverButton = await screen.findByRole("button", { name: "Move to Today" })
    fireEvent.click(rolloverButton)

    await waitFor(() => {
      expect((rolloverButton as HTMLButtonElement).disabled).toBe(true)
    })

    await act(async () => {
      resolveUpdate?.()
      await Promise.resolve()
    })
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Move to Today" })).toBeNull()
    })
  })

  it("收起状态下不探测昨日未完成待办", async () => {
    const api = createServerMock([
      createItem({ id: 1, entryDate: yesterdayKey, content: "Yesterday pending" }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    renderPanel(false)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(api.listByDate).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Move to Today" })).toBeNull()
  })
})
