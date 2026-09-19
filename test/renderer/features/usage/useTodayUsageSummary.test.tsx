// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTodayUsageSummary } from "@/features/usage/hooks/useTodayUsageSummary"
import type { UsageSummary } from "@/features/usage/types"

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

describe("useTodayUsageSummary", () => {
  let getSummary: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSummary = vi.fn().mockResolvedValue(summary)
    // @ts-expect-error Mock window.api
    window.api = { usage: { getSummary } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("收起状态不请求", async () => {
    const { rerender } = renderHook(({ enabled }) => useTodayUsageSummary(enabled), {
      initialProps: { enabled: false },
    })

    rerender({ enabled: false })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSummary).not.toHaveBeenCalled()
  })

  it("展开时按今日边界请求一次并回填汇总", async () => {
    const { result } = renderHook(() => useTodayUsageSummary(true))

    await waitFor(() => expect(result.current.summary).toEqual(summary))
    expect(getSummary).toHaveBeenCalledTimes(1)

    const query = getSummary.mock.calls[0][0] as { startTime: number; endTime: number }
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    expect(query.startTime).toBe(startOfToday.getTime())
    expect(query.endTime).toBeGreaterThanOrEqual(query.startTime)
    expect(Date.now() - query.endTime).toBeLessThan(5000)
  })

  it("保持展开不重复请求，收起再展开发起第二次请求", async () => {
    const { rerender } = renderHook(({ enabled }) => useTodayUsageSummary(enabled), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(1))

    rerender({ enabled: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSummary).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    rerender({ enabled: true })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2))
  })

  it("加载失败时置错误态且不保留旧汇总", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getSummary.mockRejectedValue(new Error("network down"))

    const { result } = renderHook(() => useTodayUsageSummary(true))

    await waitFor(() => expect(result.current.hasError).toBe(true))
    expect(result.current.summary).toBeNull()
  })

  it("重建展开后丢弃过期响应", async () => {
    let resolveFirst!: (value: UsageSummary) => void
    const first = new Promise<UsageSummary>((resolve) => {
      resolveFirst = resolve
    })
    const latest: UsageSummary = { ...summary, requestCount: 9 }
    getSummary.mockReturnValueOnce(first).mockResolvedValueOnce(latest)

    const { result, rerender } = renderHook(({ enabled }) => useTodayUsageSummary(enabled), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(1))

    rerender({ enabled: false })
    rerender({ enabled: true })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.summary).toEqual(latest))

    await act(async () => {
      resolveFirst(summary)
      await first
    })
    expect(result.current.summary).toEqual(latest)
  })
})
