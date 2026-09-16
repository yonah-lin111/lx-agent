import type { SchedulePriority } from "@shared/contracts/schedule"
import { useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { useTranslation } from "@/i18n"
import { getNextPriority } from "../utils"
import { SchedulePriorityChip } from "./SchedulePriorityChip"

// 快速录入表单属性。
export interface ScheduleComposerProps {
  // 提交回调：返回是否创建成功（失败时保留草稿）。
  onSubmit: (content: string, priority: SchedulePriority) => Promise<boolean>
}

/**
 * 渲染日程快速录入表单：回车保存、Tab 循环优先级、Shift+Enter 换行。
 */
export const ScheduleComposer = ({ onSubmit }: ScheduleComposerProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [content, setContent] = useState<string>("")
  const [priority, setPriority] = useState<SchedulePriority>("P1")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleSubmit = async (): Promise<void> => {
    const trimmed = content.trim()
    if (!trimmed) return

    const isCreated = await onSubmit(trimmed, priority)
    if (!isCreated) return

    setContent("")
    inputRef.current?.focus()
  }

  return (
    <LxInput
      ref={inputRef}
      multiline
      className="lx-schedule-composer"
      placeholder={t("schedule.composerPlaceholder")}
      value={content}
      onChange={(event) => setContent(event.target.value)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing) return
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault()
          void handleSubmit()
        }
        if (event.key === "Tab") {
          event.preventDefault()
          setPriority((current) => getNextPriority(current))
        }
      }}
      prefix={
        <SchedulePriorityChip
          priority={priority}
          label={t("schedule.cyclePriority")}
          onClick={() => setPriority((current) => getNextPriority(current))}
        />
      }
      suffix={
        <LxIconButton
          preset="add"
          size="small"
          aria-label={t("schedule.addAction")}
          disabled={!content.trim()}
          title={{ content: t("schedule.addAction"), placement: "top" }}
          onClick={() => void handleSubmit()}
        />
      }
    />
  )
}
