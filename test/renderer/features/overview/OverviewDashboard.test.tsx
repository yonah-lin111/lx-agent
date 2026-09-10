// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OverviewDashboard } from "@/features/overview/components/OverviewDashboard"
import type { OverviewStats } from "@/features/overview/types"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const mockStats: OverviewStats = {
  metrics: {
    periodSummary: {
      range: "today",
      turns: 8,
      toolCalls: 16,
      toolSuccessRate: 90,
      toolAvgDurationMs: 250,
      sessionCount: 2,
    },
    agentTurns: { total30d: 50, today: 8 },
    toolCalls: { total: 100, successCount: 90, successRate: 90 },
    activeDays: { totalDays: 15, longestStreak: 5, currentStreak: 2, activeRate: 40 },
    sessions: { total: 10, lastActiveAt: "2026-03-01T12:00:00Z" },
  },
  activityHeatmap: [
    { date: "2026-03-01", count: 4, turns: 2, toolCalls: 2 },
    { date: "2026-03-02", count: 2, turns: 1, toolCalls: 1 },
  ],
  projects: [
    { id: "proj-1", name: "Alpha Project" },
    { id: "proj-2", name: "Beta Project" },
  ],
}

describe("OverviewDashboard", () => {
  beforeEach(() => {
    // @ts-expect-error Mock window.api
    window.api = {
      overview: {
        getStats: vi.fn().mockResolvedValue(mockStats),
      },
    }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("正确渲染主标题、各卡片外部标题与 3 组独立的 Select 筛选行", async () => {
    render(<OverviewDashboard />)

    // 等待数据加载完成
    await waitFor(() => {
      expect(screen.getByText(/今日数据统计说明|Today's Statistics Summary/i)).toBeDefined()
    })

    // 1. 主标题与副标题
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined()

    // 2. 统计说明区域外部标题
    expect(screen.getByText(/今日数据统计说明|Today's Statistics Summary/i)).toBeDefined()

    // 3. 核心数据指标外部标题
    expect(screen.getByText(/核心数据指标|Core Metrics/i)).toBeDefined()

    // 4. 绿墙区域外部标题与活动计数
    expect(screen.getByText(/生产力绿墙|Productivity Heatmap/i)).toBeDefined()
    expect(screen.getByText(/6 次活动|6 activities/i)).toBeDefined()

    // 5. 3 组独立的下拉选项框（时间筛选、指标项目筛选、绿墙项目筛选）
    const buttons = screen.getAllByRole("button")
    expect(buttons.length).toBeGreaterThanOrEqual(3)
  })

  it("切换绿墙上方卡片的项目筛选时向 API 发送独立的 metricsProjectId", async () => {
    render(<OverviewDashboard />)

    await waitFor(() => {
      expect(screen.getAllByText(/全部项目|All Projects/i).length).toBeGreaterThanOrEqual(2)
    })

    // 第一个项目选择器是核心指标卡片的
    const metricsProjectTrigger = screen.getAllByText(/全部项目|All Projects/i)[0]
    fireEvent.click(metricsProjectTrigger)

    const alphaOption = screen.getByText("Alpha Project")
    fireEvent.mouseDown(alphaOption)

    await waitFor(() => {
      expect(window.api.overview.getStats).toHaveBeenCalledWith(
        expect.objectContaining({
          metricsProjectId: "proj-1",
        }),
      )
    })
  })

  it("切换绿墙项目筛选时向 API 发送独立的 heatmapProjectId", async () => {
    render(<OverviewDashboard />)

    await waitFor(() => {
      expect(screen.getAllByText(/全部项目|All Projects/i).length).toBeGreaterThanOrEqual(2)
    })

    // 第二个项目选择器是绿墙的
    const heatmapProjectTrigger = screen.getAllByText(/全部项目|All Projects/i)[1]
    fireEvent.click(heatmapProjectTrigger)

    const betaOption = screen.getByText("Beta Project")
    fireEvent.mouseDown(betaOption)

    await waitFor(() => {
      expect(window.api.overview.getStats).toHaveBeenCalledWith(
        expect.objectContaining({
          heatmapProjectId: "proj-2",
        }),
      )
    })
  })

  it("切换时间筛选时向 API 发送独立的 timeRange", async () => {
    render(<OverviewDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/今日数据统计说明|Today's Statistics Summary/i)).toBeDefined()
    })

    const timeTrigger = screen.getAllByRole("button")[0]
    fireEvent.click(timeTrigger)

    const option7d = screen.getByText(/近 7 天|Last 7 Days/)
    fireEvent.mouseDown(option7d)

    await waitFor(() => {
      expect(window.api.overview.getStats).toHaveBeenCalledWith(
        expect.objectContaining({
          timeRange: "7d",
        }),
      )
    })
  })
})
