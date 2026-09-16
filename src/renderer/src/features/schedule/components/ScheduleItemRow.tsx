import type { ScheduleItem } from "@shared/contracts/schedule"
import { CalendarClock } from "lucide-react"
import { useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxDatePicker } from "@/components/ui/LxDatePicker"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { SchedulePriorityChip } from "./SchedulePriorityChip"

// 单条日程行属性。
export interface ScheduleItemRowProps {
  item: ScheduleItem
  onToggle: (item: ScheduleItem) => void
  onCyclePriority: (item: ScheduleItem) => void
  onRename: (item: ScheduleItem, content: string) => void
  onMove: (item: ScheduleItem, targetEntryDate: string) => void
  onDelete: (item: ScheduleItem) => void
}

/**
 * 渲染单条日程：完成勾选、优先级循环、行内编辑、移动到指定日期与删除确认。
 */
export const ScheduleItemRow = ({
  item,
  onToggle,
  onCyclePriority,
  onRename,
  onMove,
  onDelete,
}: ScheduleItemRowProps): React.JSX.Element => {
  const { t } = useTranslation()
  // 行内编辑草稿；null 表示未处于编辑态。
  const [draft, setDraft] = useState<string | null>(null)
  const [isMoveOpen, setIsMoveOpen] = useState<boolean>(false)

  const commitDraft = (): void => {
    if (draft === null) return
    const nextContent = draft.trim()
    // 空文本保持原值，避免误删。
    if (nextContent && nextContent !== item.content) onRename(item, nextContent)
    setDraft(null)
  }

  return (
    <div
      className="lx-schedule-item group flex items-start gap-2 rounded-[var(--theme-radius-base)] border border-transparent px-2 py-1.5 transition-colors hover:border-[var(--color-theme-border)] hover:bg-[var(--color-theme-surface-hover)]"
      data-completed={item.completed ? "true" : undefined}
    >
      <span className="pt-0.5">
        <LxCheckbox
          size="small"
          checked={item.completed}
          aria-label={item.completed ? t("schedule.markUndone") : t("schedule.markDone")}
          onChange={() => onToggle(item)}
        />
      </span>

      <span className="pt-px">
        <SchedulePriorityChip
          priority={item.priority}
          completed={item.completed}
          label={t("schedule.cyclePriority")}
          onClick={() => onCyclePriority(item)}
        />
      </span>

      {draft !== null ? (
        <LxInput
          multiline
          autoFocus
          size="small"
          className="lx-schedule-item-editor min-w-0 flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              commitDraft()
            }
            if (event.key === "Escape") setDraft(null)
            if (event.key === "Tab") {
              event.preventDefault()
              onCyclePriority(item)
            }
          }}
        />
      ) : (
        <button
          type="button"
          className={`min-w-0 flex-1 rounded-[4px] border border-transparent px-1 text-left text-[13px] leading-5 transition-colors ${
            item.completed
              ? "text-[var(--color-theme-text-subtle)] line-through decoration-[var(--color-theme-text-subtle)]"
              : "text-[var(--color-theme-text)]"
          }`}
          onClick={() => setDraft(item.content)}
        >
          {item.content}
        </button>
      )}

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <LxTooltip
          trigger="click"
          placement="left"
          click={{
            open: isMoveOpen,
            onOpenChange: setIsMoveOpen,
            closeOnContentClick: false,
            content: (
              <div className="flex w-[292px] flex-col gap-1.5">
                <span className="text-xs font-semibold text-[var(--color-theme-text-muted)]">
                  {t("schedule.moveToDate")}
                </span>
                <LxDatePicker
                  value={item.entryDate}
                  quickSelects={false}
                  onChange={(targetDate) => {
                    setIsMoveOpen(false)
                    if (targetDate !== item.entryDate) onMove(item, targetDate)
                  }}
                />
              </div>
            ),
          }}
        >
          <LxIconButton
            size="small"
            variant="ghost"
            aria-label={t("schedule.moveToDate")}
            title={{ content: t("schedule.moveToDate"), placement: "left" }}
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </LxIconButton>
        </LxTooltip>

        <LxIconButton
          preset="delete"
          size="small"
          variant="ghost"
          aria-label={t("schedule.deleteAction")}
          title={{
            content: t("schedule.deleteConfirm"),
            placement: "left",
            onConfirm: () => onDelete(item),
          }}
        />
      </div>
    </div>
  )
}
