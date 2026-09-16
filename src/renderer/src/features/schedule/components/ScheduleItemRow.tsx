import type { ScheduleItem } from "@shared/contracts/schedule"
import { CalendarClock } from "lucide-react"
import { useCallback, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxDatePicker } from "@/components/ui/LxDatePicker"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { formatDateLabel } from "@/lib/date"
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
 * 渲染单条日程（单行）：完成勾选、优先级循环、行内编辑、移动日期二次确认与删除确认。
 */
export const ScheduleItemRow = ({
  item,
  onToggle,
  onCyclePriority,
  onRename,
  onMove,
  onDelete,
}: ScheduleItemRowProps): React.JSX.Element => {
  const { t, locale } = useTranslation()
  // 行内编辑草稿；null 表示未处于编辑态。
  const [draft, setDraft] = useState<string | null>(null)
  // 移动日期流程：气泡开关与已选目标日期（非空时进入二次确认态）。
  const [isMoveOpen, setIsMoveOpen] = useState<boolean>(false)
  const [moveTargetDate, setMoveTargetDate] = useState<string | null>(null)

  const commitDraft = (): void => {
    if (draft === null) return
    const nextContent = draft.trim()
    // 空文本保持原值，避免误删。
    if (nextContent && nextContent !== item.content) onRename(item, nextContent)
    setDraft(null)
  }

  const handleMoveOpenChange = useCallback((nextOpen: boolean): void => {
    setIsMoveOpen(nextOpen)
    if (!nextOpen) setMoveTargetDate(null)
  }, [])

  const handleConfirmMove = (): void => {
    if (moveTargetDate && moveTargetDate !== item.entryDate) onMove(item, moveTargetDate)
    handleMoveOpenChange(false)
  }

  return (
    <div
      className="lx-schedule-item group flex h-7 items-center gap-2 rounded-[4px] px-1.5 transition-colors hover:bg-[var(--color-theme-surface-hover)]"
      data-completed={item.completed ? "true" : undefined}
      data-item-level="2"
    >
      <LxCheckbox
        size="small"
        checked={item.completed}
        aria-label={item.completed ? t("schedule.markUndone") : t("schedule.markDone")}
        onChange={() => onToggle(item)}
      />

      <SchedulePriorityChip
        priority={item.priority}
        completed={item.completed}
        label={t("schedule.cyclePriority")}
        onClick={() => onCyclePriority(item)}
      />

      {draft !== null ? (
        <LxInput
          autoFocus
          size="small"
          className="lx-schedule-item-editor min-w-0 flex-1"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === "Enter") {
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
          data-variant="ghost"
          className={`min-w-0 flex-1 truncate border-none bg-transparent p-0 text-left text-[13px] leading-5 ${
            item.completed
              ? "text-[var(--color-theme-text-subtle)] line-through"
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
          click={
            moveTargetDate
              ? {
                  open: isMoveOpen,
                  onOpenChange: handleMoveOpenChange,
                  title: t("schedule.moveToDate"),
                  content: t("schedule.moveToConfirm", {
                    date: formatDateLabel(moveTargetDate, locale),
                  }),
                  onConfirm: handleConfirmMove,
                  onCancel: () => handleMoveOpenChange(false),
                }
              : {
                  open: isMoveOpen,
                  onOpenChange: handleMoveOpenChange,
                  closeOnContentClick: false,
                  content: (
                    <LxDatePicker
                      inline
                      value={item.entryDate}
                      quickSelects={false}
                      onChange={setMoveTargetDate}
                    />
                  ),
                }
          }
        >
          <LxIconButton
            size="small"
            aria-label={t("schedule.moveToDate")}
            title={{ content: t("schedule.moveToDate"), placement: "left" }}
          >
            <CalendarClock className="h-3.5 w-3.5" />
          </LxIconButton>
        </LxTooltip>

        <LxIconButton
          preset="delete"
          size="small"
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
