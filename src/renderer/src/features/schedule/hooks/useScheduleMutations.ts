import type { ScheduleItem, SchedulePriority } from "@shared/contracts/schedule"
import { useCallback } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { scheduleApi } from "../api/scheduleApi"
import type { ScheduleItemPatch } from "../types"
import { getNextPriority, sortScheduleItems } from "../utils"

// 写操作 Hook 参数。
interface UseScheduleMutationsOptions {
  // 当前查看日期（新建条目默认归属该日期）。
  entryDate: string
  items: ScheduleItem[]
  setItems: React.Dispatch<React.SetStateAction<ScheduleItem[]>>
  // 写操作成功后的刷新回调（月历角标 / 趋势统计）。
  onChanged?: () => void
}

/**
 * 日程写操作集合：统一异常提示，并按服务端返回值同步当日列表状态。
 */
export const useScheduleMutations = ({
  entryDate,
  items,
  setItems,
  onChanged,
}: UseScheduleMutationsOptions) => {
  const { t } = useTranslation()
  const toast = useLxToast()

  // 通用更新：目标日期变化时从当前列表移除，否则原位替换。
  const updateItem = useCallback(
    async (id: number, patch: ScheduleItemPatch): Promise<boolean> => {
      try {
        const updated = await scheduleApi.update({ id, ...patch })
        if (patch.entryDate !== undefined && patch.entryDate !== entryDate) {
          setItems((current) => current.filter((item) => item.id !== id))
        } else {
          setItems((current) => current.map((item) => (item.id === id ? updated : item)))
        }
        onChanged?.()
        return true
      } catch {
        toast.error(t("schedule.updateFailed"))
        return false
      }
    },
    [entryDate, onChanged, setItems, t, toast],
  )

  // 新建条目：置顶插入当日列表。
  const createItem = useCallback(
    async (content: string, priority: SchedulePriority): Promise<boolean> => {
      try {
        const created = await scheduleApi.create({ entryDate, content, priority })
        setItems((current) => [created, ...current])
        onChanged?.()
        return true
      } catch {
        toast.error(t("schedule.createFailed"))
        return false
      }
    },
    [entryDate, onChanged, setItems, t, toast],
  )

  const removeItem = useCallback(
    async (id: number): Promise<void> => {
      try {
        await scheduleApi.remove(id)
        setItems((current) => current.filter((item) => item.id !== id))
        onChanged?.()
      } catch {
        toast.error(t("schedule.deleteFailed"))
      }
    },
    [onChanged, setItems, t, toast],
  )

  // 一键重排：按当前列表计算目标顺序并持久化。
  const sortItems = useCallback(async (): Promise<void> => {
    const sorted = sortScheduleItems(items)
    try {
      await scheduleApi.reorder({ entryDate, ids: sorted.map((item) => item.id) })
      setItems(sorted)
      onChanged?.()
    } catch {
      toast.error(t("schedule.sortFailed"))
    }
  }, [entryDate, items, onChanged, setItems, t, toast])

  const toggleItem = useCallback(
    (item: ScheduleItem) => updateItem(item.id, { completed: !item.completed }),
    [updateItem],
  )

  const cyclePriority = useCallback(
    (item: ScheduleItem) => updateItem(item.id, { priority: getNextPriority(item.priority) }),
    [updateItem],
  )

  const renameItem = useCallback(
    (item: ScheduleItem, content: string) => updateItem(item.id, { content }),
    [updateItem],
  )

  const moveItem = useCallback(
    (item: ScheduleItem, targetEntryDate: string) =>
      updateItem(item.id, { entryDate: targetEntryDate }),
    [updateItem],
  )

  const deleteItem = useCallback((item: ScheduleItem) => removeItem(item.id), [removeItem])

  return {
    createItem,
    toggleItem,
    cyclePriority,
    renameItem,
    moveItem,
    deleteItem,
    sortItems,
  }
}
