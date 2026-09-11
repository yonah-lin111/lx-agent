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
    expect(result.current.range).toBe("today")
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

  it("刷新时按当前时间重新解析时间范围，endTime 不冻结在挂载时刻", async () => {
    vi.useFakeTimers()
    const mountTime = new Date(2026, 8, 11, 10, 0, 0).getTime()
    vi.setSystemTime(mountTime)
    try {
      const { result, unmount } = renderHook(() => useUsageData())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(usageMock.getSummary.mock.calls[0][0].endTime).toBe(mountTime)

      const laterTime = mountTime + 2 * 60 * 60 * 1000
      vi.setSystemTime(laterTime)
      act(() => {
        result.current.refresh()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      const lastQuery = usageMock.getSummary.mock.calls.at(-1)?.[0]
      expect(lastQuery.endTime).toBe(laterTime)
      unmount()
    } finally {
      vi.useRealTimers()
    }
  })

  it("开启自动刷新后按间隔拉取，关闭后停止", async () => {
    vi.useFakeTimers()
    try {
      const { result, unmount } = renderHook(() => useUsageData())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(usageMock.getSummary).toHaveBeenCalledTimes(1)
      expect(result.current.refreshIntervalMs).toBe(0)

      act(() => {
        result.current.setRefreshIntervalMs(5000)
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000)
      })
      expect(usageMock.getSummary.mock.calls.length).toBeGreaterThanOrEqual(2)

      act(() => {
        result.current.setRefreshIntervalMs(0)
      })
      const callsAfterStop = usageMock.getSummary.mock.calls.length
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      expect(usageMock.getSummary.mock.calls.length).toBe(callsAfterStop)

      unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})
