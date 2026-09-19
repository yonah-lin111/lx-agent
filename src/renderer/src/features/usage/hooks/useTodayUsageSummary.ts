import { resolveUsageRangeSelection } from "@shared/contracts/usage"
import { useEffect, useRef, useState } from "react"
import { usageApi } from "../api/usageApi"
import type { UsageSummary } from "../types"

// 今日用量汇总 hook 结果。
export interface UseTodayUsageSummaryResult {
  summary: UsageSummary | null
  hasError: boolean
}

/**
 * 管理顶部栏"今日用量"数据：启用时按当前时间拉取一次今日汇总，不订阅实时事件。
 * 每次 false→true（重新展开）都会重新请求；收起或卸载作废在途响应，避免过期数据覆盖。
 */
export const useTodayUsageSummary = (enabled: boolean): UseTodayUsageSummaryResult => {
  const [summary, setSummary] = useState<UsageSummary | null>(null)
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
        const bounds = resolveUsageRangeSelection({ preset: "today" })
        const nextSummary = await usageApi.getSummary(bounds)
        if (requestId !== requestIdRef.current) return
        setSummary(nextSummary)
      } catch (error) {
        if (requestId !== requestIdRef.current) return
        console.error("Failed to load today usage summary", error)
        setHasError(true)
      }
    }

    void load()

    return () => {
      requestIdRef.current += 1
    }
  }, [enabled])

  return { summary, hasError }
}
