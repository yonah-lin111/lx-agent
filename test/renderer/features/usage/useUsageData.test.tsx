// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useUsageData } from "@/features/usage/hooks/useUsageData"
import type {
  UsageDailyPoint,
  UsageFilterOptions,
  UsageLogPage,
  UsageModelStats,
  UsageProviderStats,
  UsageSummary,
} from "@/features/usage/types"

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
  pricedRequestCount: 0,
  totalCostUsd: null,
  successRate: 100,
  avgDurationMs: 100,
}
const daily: UsageDailyPoint[] = []
const modelStats: UsageModelStats[] = []
const providerStats: UsageProviderStats[] = []
const filterOptions: UsageFilterOptions = { providers: [], models: [], projects: [] }
const logPage: UsageLogPage = { rows: [], total: 0, page: 1, pageSize: 50 }

describe("useUsageData", () => {
  let onLogRecordedHandler: (() => void) | undefined
  let usageMock: {
    listLogs: ReturnType<typeof vi.fn>
    getSummary: ReturnType<typeof vi.fn>
    getDaily: ReturnType<typeof vi.fn>
    getModelStats: ReturnType<typeof vi.fn>
    getProviderStats: ReturnType<typeof vi.fn>
    getFilterOptions: ReturnType<typeof vi.fn>
    onLogRecorded: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    onLogRecordedHandler = undefined
    usageMock = {
      listLogs: vi.fn().mockResolvedValue(logPage),
      getSummary: vi.fn().mockResolvedValue(summary),
      getDaily: vi.fn().mockResolvedValue(daily),
      getModelStats: vi.fn().mockResolvedValue(modelStats),
      getProviderStats: vi.fn().mockResolvedValue(providerStats),
      getFilterOptions: vi.fn().mockResolvedValue(filterOptions),
      onLogRecorded: vi.fn((handler: () => void) => {
        onLogRecordedHandler = handler
        return vi.fn()
      }),
    }
    // @ts-expect-error Mock window.api
    window.api = { usage: usageMock }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("初始加载成功并订阅日志事件", async () => {
    const { result } = renderHook(() => useUsageData())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.summary).toEqual(summary)
    expect(result.current.error).toBeNull()
    expect(usageMock.getSummary).toHaveBeenCalledTimes(1)
    expect(usageMock.onLogRecorded).toHaveBeenCalledTimes(1)
    expect(onLogRecordedHandler).toBeTypeOf("function")
  })

  it("加载失败时暴露错误信息", async () => {
    usageMock.getSummary.mockRejectedValue(new Error("network down"))
    const { result } = renderHook(() => useUsageData())

    await waitFor(() => {
      expect(result.current.error).toBe("network down")
    })
    expect(result.current.isLoading).toBe(false)
  })

  it("切换 Provider 级联清空模型并重置页码", async () => {
    const { result } = renderHook(() => useUsageData())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => {
      result.current.setModel("claude-sonnet")
    })
    await waitFor(() => {
      expect(usageMock.listLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: "claude-sonnet" }),
        1,
        50,
      )
    })

    act(() => {
      result.current.setPage(3)
    })
    await waitFor(() => {
      expect(usageMock.listLogs).toHaveBeenLastCalledWith(expect.anything(), 3, 50)
    })

    act(() => {
      result.current.setProvider("openai")
    })
    expect(result.current.model).toBeUndefined()
    await waitFor(() => {
      expect(usageMock.listLogs).toHaveBeenLastCalledWith(
        expect.objectContaining({ provider: "openai" }),
        1,
        50,
      )
    })
  })

  it("日志写入事件防抖后重新拉取数据", async () => {
    renderHook(() => useUsageData())
    await waitFor(() => expect(usageMock.getSummary).toHaveBeenCalledTimes(1))

    act(() => {
      onLogRecordedHandler?.()
      onLogRecordedHandler?.()
    })

    await waitFor(
      () => {
        expect(usageMock.getSummary.mock.calls.length).toBeGreaterThan(1)
      },
      { timeout: 2500 },
    )
  })
})
