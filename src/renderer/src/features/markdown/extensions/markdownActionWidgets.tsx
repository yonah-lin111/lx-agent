import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDot,
  Copy,
  Trash2,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { MarkdownTemplateStatus } from "@/features/markdown/commands/markdownBlockCommands"
import { useTranslation } from "@/i18n"

// 模板块状态按钮的悬停与普通颜色。
const TEMPLATE_STATUS_COLOR: Record<MarkdownTemplateStatus, string> = {
  todo: "rgba(255, 255, 255, 0.5)",
  in_progress: "#fbbf24",
  done: "#34d399",
}

// 源码区操作按钮统一样式。
const ACTION_BUTTON_STYLE: React.CSSProperties = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  display: "flex",
  padding: "2px",
  transition: "color 0.2s",
}

// 复制按钮：复制内容到剪贴板并短暂显示成功反馈。
export const MarkdownActionCopyButton = ({
  text,
  label,
  isTemplate = false,
}: {
  text: string
  label?: string
  isTemplate?: boolean
}): React.JSX.Element => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)
  const defaultLabel = isTemplate ? t("markdown.copyTemplate") : t("markdown.copyCode")
  const copyLabel = label ?? defaultLabel

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      setIsCopied(true)
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = window.setTimeout(() => {
        setIsCopied(false)
        resetTimerRef.current = null
      }, 1500)
    } catch {
      setIsCopied(false)
    }
  }

  return (
    <LxTooltip content={isCopied ? t("markdown.copiedCode") : copyLabel} placement="bottom">
      <button
        aria-label={isCopied ? t("markdown.copiedCode") : copyLabel}
        type="button"
        style={{
          ...ACTION_BUTTON_STYLE,
          color: isCopied ? "#34d399" : "rgba(255, 255, 255, 0.5)",
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void copy()
        }}
      >
        {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </LxTooltip>
  )
}

// 删除按钮：点击后弹出二次确认，确认后删除当前模板块。
export const MarkdownActionDeleteButton = ({
  onDelete,
}: {
  onDelete: () => void
}): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <LxTooltip
      content={t("markdown.confirmDeleteTemplate")}
      placement="bottom"
      onConfirm={onDelete}
    >
      <button
        aria-label={t("markdown.deleteTemplate")}
        type="button"
        style={{ ...ACTION_BUTTON_STYLE, color: "rgba(255, 255, 255, 0.5)" }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </LxTooltip>
  )
}

// 折叠按钮：切换代码块/模板块内容的折叠状态。
export const MarkdownActionFoldButton = ({
  isFolded,
  label,
  unfoldLabel,
  isTemplate = false,
  onToggle,
}: {
  isFolded: boolean
  label?: string
  unfoldLabel?: string
  isTemplate?: boolean
  onToggle: () => void
}): React.JSX.Element => {
  const { t } = useTranslation()
  const defaultFold = isTemplate ? t("markdown.foldTemplate") : t("markdown.foldCode")
  const defaultUnfold = isTemplate ? t("markdown.unfoldTemplate") : t("markdown.unfoldCode")
  const foldText = label ?? defaultFold
  const unfoldText = unfoldLabel ?? defaultUnfold

  return (
    <LxTooltip content={isFolded ? unfoldText : foldText} placement="bottom">
      <button
        aria-label={isFolded ? unfoldText : foldText}
        type="button"
        style={{ ...ACTION_BUTTON_STYLE, color: "rgba(255, 255, 255, 0.5)" }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggle()
        }}
      >
        {isFolded ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>
    </LxTooltip>
  )
}

// 状态按钮：循环切换模板块结束行的状态标记。
export const TemplateStatusButton = ({
  status,
  onToggle,
}: {
  status: MarkdownTemplateStatus
  onToggle: () => void
}): React.JSX.Element => {
  const { t } = useTranslation()
  const [isHovered, setIsHovered] = useState(false)
  const StatusIcon =
    status === "done" ? CheckCircle2 : status === "in_progress" ? CircleDot : Circle
  const label =
    status === "done"
      ? t("markdown.markTodo")
      : status === "in_progress"
        ? t("markdown.markCompleted")
        : t("markdown.markInProgress")

  return (
    <LxTooltip content={label} placement="bottom">
      <button
        aria-label={label}
        type="button"
        style={{
          ...ACTION_BUTTON_STYLE,
          color: isHovered && status === "todo" ? "#ffffff" : TEMPLATE_STATUS_COLOR[status],
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onToggle()
        }}
      >
        <StatusIcon className="h-3 w-3" />
      </button>
    </LxTooltip>
  )
}
