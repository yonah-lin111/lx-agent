import { ArrowUpDown } from "lucide-react"
import { useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import { getTodayKey } from "@/lib/date"
import { useScheduleItems } from "../hooks/useScheduleItems"
import { useScheduleMutations } from "../hooks/useScheduleMutations"
import type { ScheduleStatusFilter } from "../types"
import { filterScheduleItems, sortScheduleItems } from "../utils"
import { ScheduleComposer } from "./ScheduleComposer"
import { ScheduleItemRow } from "./ScheduleItemRow"

// 顶部栏日程面板属性。
export interface HeaderSchedulePanelProps {
  // 顶部栏展开状态：收起时延迟加载并停止订阅变更。
  isExpanded: boolean
}

const STATUS_FILTERS: readonly ScheduleStatusFilter[] = ["all", "pending", "completed"]

const FILTER_LABEL_KEYS = {
  all: "schedule.filterAll",
  pending: "schedule.filterPending",
  completed: "schedule.filterCompleted",
} as const

/**
 * 渲染顶部栏左侧"今日待办"面板：状态过滤 / 优先级重排 / 快速录入与完整增删改查。
 */
export const HeaderSchedulePanel = ({
  isExpanded,
}: HeaderSchedulePanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  // 顶部栏面板固定操作"今天"。
  const entryDate = getTodayKey()
  const { items, setItems, isLoading, hasError } = useScheduleItems(entryDate, isExpanded)
  const mutations = useScheduleMutations({ entryDate, items, setItems })
  const [statusFilter, setStatusFilter] = useState<ScheduleStatusFilter>("all")

  const visibleItems = useMemo(
    () => filterScheduleItems(sortScheduleItems(items), statusFilter),
    [items, statusFilter],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
      {/* 标题行：状态过滤与优先级重排，对齐日程页工具条 */}
      <div className="flex h-6 shrink-0 items-center justify-between gap-2">
        <span className="truncate text-xs font-mono text-white/50">{t("header.todoTitle")}</span>
        <div className="flex shrink-0 items-center gap-1">
          {STATUS_FILTERS.map((filterKey) => (
            <LxIconButton
              key={filterKey}
              iconOnly={false}
              size="small"
              highlighted={statusFilter === filterKey}
              textClass="text-[var(--color-theme-text-muted)]"
              hoverBgClass="hover:bg-[var(--color-theme-surface-hover)]"
              hoverTextClass="hover:text-[var(--color-theme-text)]"
              highlightBgClass="bg-[var(--color-theme-text)]"
              highlightTextClass="text-[var(--color-theme-bg)]"
              className="font-medium"
              onClick={() => setStatusFilter(filterKey)}
            >
              {t(FILTER_LABEL_KEYS[filterKey])}
            </LxIconButton>
          ))}
          <LxIconButton
            size="small"
            aria-label={t("schedule.sortByPriority")}
            disabled={items.length < 2}
            title={{ content: t("schedule.sortByPriority"), placement: "bottom" }}
            onClick={() => void mutations.sortItems()}
          >
            <ArrowUpDown />
          </LxIconButton>
        </div>
      </div>
      <div className="shrink-0">
        <ScheduleComposer onSubmit={mutations.createItem} />
      </div>
      <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-0.5">
        {hasError ? (
          <p className="px-1 py-2 text-xs text-white/40">{t("schedule.loadFailed")}</p>
        ) : visibleItems.length > 0 ? (
          visibleItems.map((item) => (
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
            {items.length > 0
              ? t("header.todoFilterEmpty")
              : isLoading
                ? t("schedule.loading")
                : t("header.todoEmpty")}
          </p>
        )}
      </div>
    </div>
  )
}
