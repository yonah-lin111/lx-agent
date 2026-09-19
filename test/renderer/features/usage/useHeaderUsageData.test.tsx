// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useHeaderUsageData } from "@/features/usage/hooks/useHeaderUsageData"
import type { UsageDailyPoint, UsageSummary } from "@/features/usage/types"
import { toLocalHourKey } from "@/features/usage/utils"

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

const currentHourPoint: UsageDailyPoint = {
  date: toLocalHourKey(Date.now()),
  requestCount: 1,
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalCostUsd: null,
}

describe("useHeaderUsageData", () => {
  let getSummary: ReturnType<typeof vi.fn>
  let getDaily: ReturnType<typeof vi.fn>

  beforeEach(() => {
    getSummary = vi.fn().mockResolvedValue(summary)
    getDaily = vi.fn().mockResolvedValue([currentHourPoint])
    // @ts-expect-error Mock window.api
    window.api = { usage: { getSummary, getDaily } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("收起状态不请求", async () => {
    const { rerender } = renderHook(({ enabled }) => useHeaderUsageData(enabled), {
      initialProps: { enabled: false },
    })

    rerender({ enabled: false })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSummary).not.toHaveBeenCalled()
    expect(getDaily).not.toHaveBeenCalled()
  })

  it("展开时并行取今日汇总与逐小时序列，缺失小时补零", async () => {
    const { result } = renderHook(() => useHeaderUsageData(true))

    await waitFor(() => expect(result.current.summary).toEqual(summary))
    expect(getSummary).toHaveBeenCalledTimes(1)
    expect(getDaily).toHaveBeenCalledTimes(1)

    const query = getSummary.mock.calls[0][0] as { startTime: number; endTime: number }
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    expect(query.startTime).toBe(startOfToday.getTime())
    expect(query.endTime).toBeGreaterThanOrEqual(query.startTime)
    expect(Date.now() - query.endTime).toBeLessThan(5000)

    // 小时序列从零点补齐到当前整点，并包含查询返回的小时点。
    expect(getDaily).toHaveBeenCalledWith(expect.objectContaining(query), "hour")
    expect(result.current.hourly).toHaveLength(new Date().getHours() + 1)
    expect(result.current.hourly.at(-1)?.date).toBe(toLocalHourKey(Date.now()))
    expect(result.current.hourly.find((point) => point.date === currentHourPoint.date)).toEqual(
      currentHourPoint,
    )
    expect(result.current.hourly[0]?.requestCount).toBe(0)
  })

  it("保持展开不重复请求，收起再展开重新请求", async () => {
    const { rerender } = renderHook(({ enabled }) => useHeaderUsageData(enabled), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(1))

    rerender({ enabled: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(getSummary).toHaveBeenCalledTimes(1)
    expect(getDaily).toHaveBeenCalledTimes(1)

    rerender({ enabled: false })
    rerender({ enabled: true })
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2))
    expect(getDaily).toHaveBeenCalledTimes(2)
  })

  it("加载失败时置错误态且不保留旧数据", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    getSummary.mockRejectedValue(new Error("network down"))

    const { result } = renderHook(() => useHeaderUsageData(true))

    await waitFor(() => expect(result.current.hasError).toBe(true))
    expect(result.current.summary).toBeNull()
    expect(result.current.hourly).toEqual([])
  })

  it("重建展开后丢弃过期响应", async () => {
    let resolveFirst!: (value: UsageSummary) => void
    const first = new Promise<UsageSummary>((resolve) => {
      resolveFirst = resolve
    })
    const latest: UsageSummary = { ...summary, requestCount: 9 }
    getSummary.mockReturnValueOnce(first).mockResolvedValueOnce(latest)

    const { result, rerender } = renderHook(({ enabled }) => useHeaderUsageData(enabled), {
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
