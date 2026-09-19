import { useMemo } from "react"
import { useTranslation } from "@/i18n"
import { getTodayKey } from "@/lib/date"
import { useScheduleItems } from "../hooks/useScheduleItems"
import { useScheduleMutations } from "../hooks/useScheduleMutations"
import { sortScheduleItems } from "../utils"
import { ScheduleComposer } from "./ScheduleComposer"
import { ScheduleItemRow } from "./ScheduleItemRow"

// 顶部栏日程面板属性。
export interface HeaderSchedulePanelProps {
  // 顶部栏展开状态：收起时延迟加载并停止订阅变更。
  isExpanded: boolean
}

/**
 * 渲染顶部栏左侧"今日待办"面板：快速录入与完整增删改查（勾选 / 优先级 / 重命名 / 移动 / 删除）。
 */
export const HeaderSchedulePanel = ({
  isExpanded,
}: HeaderSchedulePanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  // 顶部栏面板固定操作"今天"。
  const entryDate = getTodayKey()
  const { items, setItems, isLoading, hasError } = useScheduleItems(entryDate, isExpanded)
  const mutations = useScheduleMutations({ entryDate, items, setItems })
  const sortedItems = useMemo(() => sortScheduleItems(items), [items])

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      <span className="shrink-0 text-xs font-mono text-white/50">{t("header.todoTitle")}</span>
      <div className="shrink-0">
        <ScheduleComposer onSubmit={mutations.createItem} />
      </div>
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5">
        {hasError ? (
          <p className="px-1 py-2 text-xs text-white/40">{t("schedule.loadFailed")}</p>
        ) : sortedItems.length > 0 ? (
          sortedItems.map((item) => (
            <ScheduleItemRow
              key={item.id}
              item={item}
              onToggle={mutations.toggleItem}
              onCyclePriority={mutations.cyclePriority}
              onRename={mutations.renameItem}
              onMove={mutations.moveItem}
              onDelete={mutations.deleteItem}
            />
          ))
        ) : (
          <p className="px-1 py-2 text-xs text-white/40">
            {isLoading ? t("schedule.loading") : t("header.todoEmpty")}
          </p>
        )}
      </div>
    </div>
  )
}
