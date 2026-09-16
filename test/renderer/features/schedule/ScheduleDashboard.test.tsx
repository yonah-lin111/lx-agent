// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScheduleDashboard } from "@/features/schedule/components/ScheduleDashboard"
import type { ScheduleItem } from "@/features/schedule/types"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

// 本地日期键（与组件默认查询日期一致）。
const toLocalDateKey = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

const createItem = (patch: Partial<ScheduleItem>): ScheduleItem => ({
  id: 1,
  entryDate: toLocalDateKey(new Date()),
  content: "task",
  priority: "P1",
  completed: false,
  completedDate: null,
  sortOrder: 0,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  ...patch,
})

const createApiMock = (items: ScheduleItem[]) => ({
  listByDate: vi.fn().mockResolvedValue(items),
  create: vi.fn().mockResolvedValue(createItem({ id: 99, content: "new task", priority: "P1" })),
  update: vi
    .fn()
    .mockImplementation(async (input: { id: number; completed?: boolean }) =>
      createItem({ id: input.id, completed: input.completed ?? false }),
    ),
  remove: vi.fn().mockResolvedValue(undefined),
  reorder: vi.fn().mockResolvedValue(undefined),
  listRangeStats: vi.fn().mockResolvedValue([]),
})

describe("ScheduleDashboard", () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("加载当日条目并渲染进度与统计面板", async () => {
    const api = createApiMock([
      createItem({ id: 1, content: "写方案", priority: "P0" }),
      createItem({ id: 2, content: "评审代码", completed: true, completedDate: "2026-09-16" }),
    ])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(<ScheduleDashboard />)

    await waitFor(() => {
      expect(screen.getByText("写方案")).toBeDefined()
    })
    expect(screen.getByText("评审代码")).toBeDefined()
    expect(screen.getByRole("button", { name: "All" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Pending" })).toBeDefined()
    expect(screen.getByRole("button", { name: "Done" })).toBeDefined()
    expect(api.listByDate).toHaveBeenCalledWith({ entryDate: toLocalDateKey(new Date()) })
    // 月历角标与趋势统计各发起一次区间查询。
    expect(api.listRangeStats).toHaveBeenCalledTimes(2)
  })

  it("回车提交新条目并按当前优先级创建", async () => {
    const api = createApiMock([])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(<ScheduleDashboard />)
    await waitFor(() => {
      expect(screen.getByText(/No tasks yet/)).toBeDefined()
    })

    const composer = screen.getByPlaceholderText(/Add a task/)
    fireEvent.change(composer, { target: { value: "新的计划" } })
    fireEvent.keyDown(composer, { key: "Enter" })

    await waitFor(() => {
      expect(api.create).toHaveBeenCalledWith({
        entryDate: toLocalDateKey(new Date()),
        content: "新的计划",
        priority: "P1",
      })
    })
    // 创建成功后清空草稿。
    await waitFor(() => {
      expect((composer as HTMLInputElement).value).toBe("")
    })
  })

  it("勾选复选框提交完成状态更新", async () => {
    const api = createApiMock([createItem({ id: 7, content: "待完成" })])
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(<ScheduleDashboard />)
    await waitFor(() => {
      expect(screen.getByText("待完成")).toBeDefined()
    })

    fireEvent.click(screen.getByLabelText("Mark as done"))

    await waitFor(() => {
      expect(api.update).toHaveBeenCalledWith({ id: 7, completed: true })
    })
  })

  it("首屏加载时展示整页加载遮罩，数据返回后渲染条目", async () => {
    const api = createApiMock([])
    // 同时挂起当日列表与昨日顺延探测两次查询，直到测试显式放行。
    const pending: Array<{ entryDate: string; resolve: (items: ScheduleItem[]) => void }> = []
    api.listByDate.mockImplementation(
      (input: { entryDate: string }) =>
        new Promise<ScheduleItem[]>((resolve) => {
          pending.push({ entryDate: input.entryDate, resolve })
        }),
    )
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(<ScheduleDashboard />)

    // 数据未返回时遮罩可见
    const overlay = screen.getByRole("status")
    expect(overlay.getAttribute("aria-label")).toBe("Loading schedule...")
    expect(overlay.className).toContain("opacity-100")

    const todayKey = toLocalDateKey(new Date())
    for (const request of pending) {
      request.resolve(
        request.entryDate === todayKey ? [createItem({ id: 1, content: "延迟加载任务" })] : [],
      )
    }

    await waitFor(() => {
      expect(screen.getByText("延迟加载任务")).toBeDefined()
    })
  })

  it("加载失败时展示错误态与重试入口", async () => {
    const api = createApiMock([])
    api.listByDate.mockRejectedValue(new Error("boom"))
    // @ts-expect-error Mock window.api
    window.api = { schedule: api }

    render(<ScheduleDashboard />)

    await waitFor(() => {
      expect(screen.getByText("Failed to load schedule")).toBeDefined()
    })
    expect(screen.getByRole("button", { name: "Refresh" })).toBeDefined()
  })
})
