import type { DailyActivity } from "@shared/contracts/activity"
import { useCallback, useEffect, useState } from "react"
import { activityApi } from "../api/activityApi"

/**
 * 管理近一年每日会话活跃数据的加载状态与刷新。
 */
export const useDailyActivity = () => {
  const [entries, setEntries] = useState<DailyActivity[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setError(null)
    try {
      setEntries(await activityApi.getDaily())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activity data")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  return {
    entries,
    isLoading,
    error,
    refresh: loadData,
  }
}
