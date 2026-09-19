import { resolveUsageRangeSelection, type UsageRangeBounds } from "@shared/contracts/usage"
import { useEffect, useRef, useState } from "react"
import { usageApi } from "../api/usageApi"
import type { UsageDailyPoint, UsageSummary } from "../types"
import { fillUsageSeries } from "../utils"

// 顶部栏用量数据 hook 结果。
export interface UseHeaderUsageDataResult {
  summary: UsageSummary | null
  // 今日逐小时序列：已按当前时间补齐缺失小时，最多 24 个整点。
  hourly: UsageDailyPoint[]
  hasError: boolean
}

/**
 * 管理顶部栏"今日用量"数据：启用时并行拉取今日汇总与逐小时序列，不订阅实时事件。
 * 每次 false→true（重新展开）都会重新请求；收起或卸载作废在途响应，避免过期数据覆盖。
 */
export const useHeaderUsageData = (enabled: boolean): UseHeaderUsageDataResult => {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [hourly, setHourly] = useState<UsageDailyPoint[]>([])
  const [hasError, setHasError] = useState<boolean>(false)
  // 请求序号：状态切换或卸载时自增，用于丢弃过期响应。
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!enabled) return

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setHasError(false)

    const load = async (): Promise<void> => {
      try {
        const bounds: UsageRangeBounds = resolveUsageRangeSelection({ preset: "today" })
        const [nextSummary, points] = await Promise.all([
          usageApi.getSummary(bounds),
          usageApi.getDaily(bounds, "hour"),
        ])
        if (requestId !== requestIdRef.current) return
        setSummary(nextSummary)
        setHourly(fillUsageSeries(points, "hour", bounds.startTime, bounds.endTime))
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        console.error("Failed to load header usage data", error)
        setHasError(true)
      }
    }

    void load()

    return () => {
      requestIdRef.current += 1
    }
  }, [enabled])

  return { summary, hourly, hasError }
}
