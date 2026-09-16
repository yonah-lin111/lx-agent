import type { ScheduleItem, SchedulePriority } from "@shared/contracts/schedule"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { type TranslationKey, useTranslation } from "@/i18n"
import { SCHEDULE_PRIORITY_COLORS, SCHEDULE_PRIORITY_SEQUENCE } from "../constants"
import { groupItemsByPriority } from "../utils"
import { ScheduleItemRow } from "./ScheduleItemRow"

// 四象限文案键映射。
const QUADRANT_TITLE_KEYS: Record<SchedulePriority, TranslationKey> = {
  P0: "schedule.matrixP0",
  P1: "schedule.matrixP1",
  P2: "schedule.matrixP2",
  P3: "schedule.matrixP3",
}

// 矩阵看板属性。
export interface ScheduleMatrixBoardProps {
  items: ScheduleItem[]
  onToggle: (item: ScheduleItem) => void
  onCyclePriority: (item: ScheduleItem) => void
  onRename: (item: ScheduleItem, content: string) => void
  onMove: (item: ScheduleItem, targetEntryDate: string) => void
  onDelete: (item: ScheduleItem) => void
  onCreateInPriority: (content: string, priority: SchedulePriority) => Promise<boolean>
}

/**
 * 渲染日程四象限矩阵看板：按 P0-P3 四象限组织卡片，支持直接分象限快速录入与跨象限循环。
 */
export const ScheduleMatrixBoard = ({
  items,
  onToggle,
  onCyclePriority,
  onRename,
  onMove,
  onDelete,
  onCreateInPriority,
}: ScheduleMatrixBoardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const grouped = useMemo(() => groupItemsByPriority(items), [items])

  // 当前正在快速录入的象限（null 表示无）。
  const [activeComposerPriority, setActiveComposerPriority] = useState<SchedulePriority | null>(
    null,
  )
  const [draftContent, setDraftContent] = useState<string>("")

  const handleQuickCreate = async (priority: SchedulePriority): Promise<void> => {
    const trimmed = draftContent.trim()
    if (!trimmed) {
      setActiveComposerPriority(null)
      return
    }
    const isCreated = await onCreateInPriority(trimmed, priority)
    if (isCreated) {
      setDraftContent("")
      setActiveComposerPriority(null)
    }
  }

  return (
    <div className="grid min-h-[420px] flex-1 grid-cols-1 gap-3 md:grid-cols-2">
      {SCHEDULE_PRIORITY_SEQUENCE.map((priority) => {
        const quadrantItems = grouped[priority]
        const completedCount = quadrantItems.filter((item) => item.completed).length
        const totalCount = quadrantItems.length
        const color = SCHEDULE_PRIORITY_COLORS[priority]
        const isAdding = activeComposerPriority === priority

        return (
          <section
            key={priority}
            className="flex min-h-[190px] flex-col rounded-[var(--theme-radius-base)] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)] p-2.5 transition-colors"
          >
            {/* 象限头部 */}
            <div className="flex items-center justify-between gap-2 border-b border-[var(--color-theme-border)] pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-xs font-mono text-[10px] font-bold text-white"
                  style={{ backgroundColor: color }}
                >
                  {priority}
                </span>
                <h3 className="text-xs font-semibold text-[var(--color-theme-text)]">
                  {t(QUADRANT_TITLE_KEYS[priority])}
                </h3>
                <span className="font-mono text-[11px] text-[var(--color-theme-text-muted)]">
                  {completedCount}/{totalCount}
                </span>
              </div>

              <LxIconButton
                size="small"
                aria-label={t("schedule.quickAdd")}
                title={{ content: t("schedule.quickAdd"), placement: "top" }}
                onClick={() => {
                  setActiveComposerPriority(isAdding ? null : priority)
                  setDraftContent("")
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </LxIconButton>
            </div>

            {/* 快速录入条 */}
            {isAdding ? (
              <div className="mt-2">
                <LxInput
                  autoFocus
                  placeholder={t("schedule.composerPlaceholder")}
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing) return
                    if (event.key === "Enter") {
                      event.preventDefault()
                      void handleQuickCreate(priority)
                    }
                    if (event.key === "Escape") {
                      event.preventDefault()
                      setActiveComposerPriority(null)
                    }
                  }}
                  onBlur={() => {
                    if (!draftContent.trim()) setActiveComposerPriority(null)
                  }}
                />
              </div>
            ) : null}

            {/* 象限待办列表 */}
            <div className="custom-scrollbar mt-2 flex flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
              {quadrantItems.length === 0 && !isAdding ? (
                <div className="flex flex-1 items-center justify-center py-6 text-center text-xs text-[var(--color-theme-text-subtle)]">
                  {t("schedule.matrixEmpty")}
                </div>
              ) : (
                quadrantItems.map((item) => (
                  <ScheduleItemRow
                    key={item.id}
                    item={item}
                    onToggle={onToggle}
                    onCyclePriority={onCyclePriority}
                    onRename={onRename}
                    onMove={onMove}
                    onDelete={onDelete}
                  />
                ))
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
