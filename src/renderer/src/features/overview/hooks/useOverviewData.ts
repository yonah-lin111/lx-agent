import { useCallback, useEffect, useState } from "react"
import { overviewApi } from "../api/overviewApi"
import type { OverviewStats } from "../types"

/**
 * 管理概览数据查询、当前关联项目筛选与刷新状态。
 */
export const useOverviewData = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all")
  const [stats, setStats] = useState<OverviewStats | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (projectId: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await overviewApi.getStats({
        projectId: projectId === "all" ? undefined : projectId,
      })
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData(selectedProjectId)
  }, [selectedProjectId, loadData])

  const refresh = useCallback(() => {
    void loadData(selectedProjectId)
  }, [selectedProjectId, loadData])

  return {
    selectedProjectId,
    setSelectedProjectId,
    stats,
    isLoading,
    error,
    refresh,
  }
}
