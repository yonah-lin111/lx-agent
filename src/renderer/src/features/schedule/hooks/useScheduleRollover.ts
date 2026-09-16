import type { ScheduleItem } from "@shared/contracts/schedule"
import { useCallback, useEffect, useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { getTodayKey, shiftDateKey } from "@/lib/date"
import { scheduleApi } from "../api/scheduleApi"

// 跨日顺延 Hook 参数。
interface UseScheduleRolloverOptions {
  entryDate: string
  onRolloverCompleted?: () => void
}

/**
 * 管理昨日未完成待办探测与一键顺延状态。
 */
export const useScheduleRollover = ({
  entryDate,
  onRolloverCompleted,
}: UseScheduleRolloverOptions) => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const todayKey = getTodayKey()
  const isViewingToday = entryDate === todayKey

  const [yesterdayIncomplete, setYesterdayIncomplete] = useState<ScheduleItem[]>([])
  const [isDismissed, setIsDismissed] = useState<boolean>(false)
  const [isRollingOver, setIsRollingOver] = useState<boolean>(false)

  // 探测昨日未完成待办。
  useEffect(() => {
    if (!isViewingToday) {
      setYesterdayIncomplete([])
      return
    }

    let isMounted = true
    const yesterdayKey = shiftDateKey(todayKey, -1)

    scheduleApi
      .listByDate(yesterdayKey)
      .then((items) => {
        if (!isMounted) return
        const incomplete = items.filter((item) => !item.completed)
        setYesterdayIncomplete(incomplete)
      })
      .catch(() => {
        if (!isMounted) return
        setYesterdayIncomplete([])
      })

    return () => {
      isMounted = false
    }
  }, [isViewingToday, todayKey])

  const dismiss = useCallback((): void => {
    setIsDismissed(true)
  }, [])

  const executeRollover = useCallback(async (): Promise<void> => {
    if (yesterdayIncomplete.length === 0 || isRollingOver) return

    setIsRollingOver(true)
    try {
      // 批量将未完成条目转移至今天。
      await Promise.all(
        yesterdayIncomplete.map((item) => scheduleApi.update({ id: item.id, entryDate: todayKey })),
      )
      toast.success(t("schedule.rolloverSuccess", { count: yesterdayIncomplete.length }))
      setYesterdayIncomplete([])
      setIsDismissed(true)
      onRolloverCompleted?.()
    } catch {
      toast.error(t("schedule.rolloverFailed"))
    } finally {
      setIsRollingOver(false)
    }
  }, [isRollingOver, onRolloverCompleted, t, toast, todayKey, yesterdayIncomplete])

  return {
    hasRolloverItems: isViewingToday && !isDismissed && yesterdayIncomplete.length > 0,
    count: yesterdayIncomplete.length,
    isRollingOver,
    dismiss,
    executeRollover,
  }
}
