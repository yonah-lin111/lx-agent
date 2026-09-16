import type { ScheduleItem } from "@shared/contracts/schedule"
import { useCallback, useEffect, useState } from "react"
import { scheduleApi } from "../api/scheduleApi"

/**
 * 管理指定日期的日程条目加载与本地状态。
 */
export const useScheduleItems = (entryDate: string) => {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasError, setHasError] = useState<boolean>(false)

  const reload = useCallback(async (): Promise<void> => {
    setIsLoading(true)
    setHasError(false)
    try {
      setItems(await scheduleApi.listByDate(entryDate))
    } catch {
      setItems([])
      setHasError(true)
    } finally {
      setIsLoading(false)
    }
  }, [entryDate])

  useEffect(() => {
    void reload()
  }, [reload])

  return { items, setItems, isLoading, hasError, reload }
}
