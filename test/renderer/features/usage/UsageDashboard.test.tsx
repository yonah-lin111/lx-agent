// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UsageDashboard } from "@/features/usage/components/UsageDashboard"
import type {
  UsageDailyPoint,
  UsageFilterOptions,
  UsageLogPage,
  UsageModelStats,
  UsageProviderStats,
  UsageSummary,
} from "@/features/usage/types"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

const summary: UsageSummary = {
  requestCount: 3,
  successCount: 2,
  errorCount: 1,
  abortedCount: 0,
  inputTokens: 1000,
  outputTokens: 200,
  cacheReadTokens: 100,
  cacheWriteTokens: 50,
  totalTokens: 1200,
  pricedRequestCount: 2,
  totalCostUsd: 0.0123,
  successRate: 66.7,
  avgDurationMs: 900,
}

const daily: UsageDailyPoint[] = [
  {
    date: "2026-09-11",
    requestCount: 3,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 100,
    cacheWriteTokens: 50,
    totalCostUsd: 0.0123,
  },
]

const modelStats: UsageModelStats[] = [
  {
    model: "claude-sonnet-4",
    requestCount: 3,
    inputTokens: 1000,
    outputTokens: 200,
    cacheReadTokens: 100,
    cacheWriteTokens: 50,
    totalTokens: 1200,
    totalCostUsd: 0.0123,
    avgCostPerRequestUsd: 0.0041,
  },
]

const providerStats: UsageProviderStats[] = [
  {
    provider: "anthropic",
    requestCount: 3,
    totalTokens: 1200,
    totalCostUsd: 0.0123,
    successRate: 66.7,
    avgDurationMs: 900,
  },
]

const filterOptions: UsageFilterOptions = {
  providers: ["anthropic"],
  models: ["claude-sonnet-4"],
  projects: [{ id: "p1", name: "Alpha Project" }],
}

const logPage: UsageLogPage = {
  rows: [
    {
      id: 1,
      externalId: "ext-1",
      sessionId: "s1",
      projectId: "p1",
      purpose: "subagent",
      provider: "anthropic",
      model: "claude-sonnet-4",
      tokens: { input: 1000, output: 200, cacheRead: 100, cacheWrite: 50 },
      rates: {
        inputCostUsd: 0.008,
        outputCostUsd: 0.003,
        cacheReadCostUsd: 0.001,
        cacheWriteCostUsd: 0.0003,
        totalCostUsd: 0.0123,
      },
      durationMs: 900,
      status: "success",
      errorMessage: null,
      createdAt: new Date(2026, 8, 11, 10, 30).getTime(),
    },
  ],
  total: 120,
  page: 1,
  pageSize: 50,
}

const createUsageMock = () => ({
  listLogs: vi.fn().mockResolvedValue(logPage),
  getSummary: vi.fn().mockResolvedValue(summary),
  getDaily: vi.fn().mockResolvedValue(daily),
  getModelStats: vi.fn().mockResolvedValue(modelStats),
  getProviderStats: vi.fn().mockResolvedValue(providerStats),
  getFilterOptions: vi.fn().mockResolvedValue(filterOptions),
  onLogRecorded: vi.fn().mockReturnValue(vi.fn()),
})

describe("UsageDashboard", () => {
  let usageMock: ReturnType<typeof createUsageMock>

  beforeEach(() => {
    usageMock = createUsageMock()
    // @ts-expect-error Mock window.api
    window.api = { usage: usageMock }
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("加载数据后渲染汇总卡、图表标题与三张表 Tab", async () => {
    render(<UsageDashboard />)

    await waitFor(() => {
      expect(screen.getByText(/Usage|用量统计/)).toBeDefined()
    })

    // 汇总卡数值。
    expect(screen.getByText("3")).toBeDefined()
    expect(screen.getAllByText("$0.0123").length).toBeGreaterThan(0)

    // 图表区域。
    expect(screen.getByText(/Token \/ Cost Trend|Token \/ 成本趋势/)).toBeDefined()
    expect(screen.getByText(/Daily Requests|每日请求数/)).toBeDefined()
    expect(screen.getAllByText(/Total Cost|总成本/).length).toBeGreaterThan(0)

    // 请求日志表（默认 Tab）。
    expect(await screen.findByText("claude-sonnet-4")).toBeDefined()
    expect(screen.getByText(/Subagent|子代理/)).toBeDefined()
    expect(usageMock.onLogRecorded).toHaveBeenCalledTimes(1)

    // 切换到模型统计与 Provider 统计。
    fireEvent.click(screen.getByText(/Model Stats|模型统计/))
    expect(await screen.findByText("$0.0041")).toBeDefined()

    fireEvent.click(screen.getByText(/Provider Stats|Provider 统计/))
    expect(await screen.findByText("anthropic")).toBeDefined()
    expect(screen.getByText("66.7%")).toBeDefined()
  })

  it("分页与刷新触发对应查询", async () => {
    render(<UsageDashboard />)
    await screen.findByText("claude-sonnet-4")

    // 下一页。
    fireEvent.click(screen.getByLabelText(/Next page|下一页/))
    await waitFor(() => {
      expect(usageMock.listLogs).toHaveBeenLastCalledWith(expect.anything(), 2, 50)
    })

    // 手动刷新重新拉取汇总。
    const callsBefore = usageMock.getSummary.mock.calls.length
    fireEvent.click(screen.getByLabelText(/Refresh|刷新/))
    await waitFor(() => {
      expect(usageMock.getSummary.mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it("加载失败展示错误提示", async () => {
    usageMock.getSummary.mockRejectedValue(new Error("boom"))
    render(<UsageDashboard />)

    expect(await screen.findByText("boom")).toBeDefined()
  })
})
