import { useCallback, useEffect, useState } from "react"
import { overviewApi } from "../api/overviewApi"
import type { OverviewStats, OverviewTimeRange } from "../types"

/**
 * 管理概览数据查询、当前关联项目筛选、时间范围与刷新状态。
 */
export const useOverviewData = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all")
  const [selectedTimeRange, setSelectedTimeRange] = useState<OverviewTimeRange>("today")
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (projectId: string, timeRange: OverviewTimeRange) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await overviewApi.getStats({
        projectId: projectId === "all" ? undefined : projectId,
        timeRange,
      })
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData(selectedProjectId, selectedTimeRange)
  }, [selectedProjectId, selectedTimeRange, loadData])

  const refresh = useCallback(() => {
    void loadData(selectedProjectId, selectedTimeRange)
  }, [selectedProjectId, selectedTimeRange, loadData])

  return {
    selectedProjectId,
    setSelectedProjectId,
    selectedTimeRange,
    setSelectedTimeRange,
    stats,
    isLoading,
    error,
    refresh,
  }
}
