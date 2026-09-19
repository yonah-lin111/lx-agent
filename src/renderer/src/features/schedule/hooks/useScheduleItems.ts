import type { ScheduleItem } from "@shared/contracts/schedule"
import { useCallback, useEffect, useState } from "react"
import { SCHEDULE_CHANGED_EVENT, scheduleApi } from "../api/scheduleApi"

/**
 * 管理指定日期的日程条目加载与本地状态。
 * enabled 为 false 时延迟加载（如顶部栏收起状态），并停止订阅跨实例变更广播。
 */
export const useScheduleItems = (entryDate: string, enabled = true) => {
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [hasError, setHasError] = useState<boolean>(false)

  const reload = useCallback(async (): Promise<void> => {
    if (!enabled) return
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
  }, [enabled, entryDate])

  useEffect(() => {
    if (!enabled) return
    void reload()
  }, [enabled, reload])

  // 任意日程写操作成功后同步刷新，消除多实例（顶部栏面板 / 日程页）脏数据。
  useEffect(() => {
    if (!enabled) return
    const handleScheduleChanged = (): void => {
      void reload()
    }
    window.addEventListener(SCHEDULE_CHANGED_EVENT, handleScheduleChanged)
    return () => window.removeEventListener(SCHEDULE_CHANGED_EVENT, handleScheduleChanged)
  }, [enabled, reload])

  return { items, setItems, isLoading, hasError, reload }
}
