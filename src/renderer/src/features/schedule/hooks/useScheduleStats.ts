import type { ScheduleDayStats } from "@shared/contracts/schedule"
import { useCallback, useEffect, useState } from "react"
import { scheduleApi } from "../api/scheduleApi"

/**
 * 管理指定日期区间的每日统计（月历角标与趋势图共用）。
 */
export const useScheduleStats = (startDate: string, endDate: string) => {
  const [stats, setStats] = useState<ScheduleDayStats[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    try {
      setStats(await scheduleApi.listRangeStats({ startDate, endDate }))
    } catch {
      setStats([])
    } finally {
      setIsLoading(false)
    }
  }, [startDate, endDate])

  useEffect(() => {
    void reload()
  }, [reload])

  return { stats, isLoading, reload }
}
