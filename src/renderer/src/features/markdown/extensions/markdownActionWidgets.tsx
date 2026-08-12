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

// 模板块状态按钮的悬停与普通颜色。
const TEMPLATE_STATUS_COLOR: Record<MarkdownTemplateStatus, string> = {
  todo: "rgba(255, 255, 255, 0.5)",
  in_progress: "#fbbf24",
  done: "#34d399",
}

// 模板块状态按钮的下一步操作提示。
const TEMPLATE_STATUS_NEXT_LABEL: Record<MarkdownTemplateStatus, string> = {
  todo: "标记为进行中",
  in_progress: "标记为已完成",
  done: "标记为未完成",
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
}: {
  text: string
  label: string
}): React.JSX.Element => {
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)

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
    <LxTooltip content={isCopied ? "已复制" : label} placement="bottom">
      <button
        aria-label={isCopied ? "已复制" : label}
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

// 删除按钮：点击确认后删除整个模板块。
export const MarkdownActionDeleteButton = ({
  label,
  onDelete,
}: {
  label: string
  onDelete: () => void
}): React.JSX.Element => (
  <LxTooltip content="是否删除当前模板块" onConfirm={onDelete} placement="bottom">
    <button
      aria-label={label}
      type="button"
      style={{ ...ACTION_BUTTON_STYLE, color: "rgba(255, 255, 255, 0.5)" }}
    >
      <Trash2 className="h-3 w-3" />
    </button>
  </LxTooltip>
)

// 折叠按钮：切换代码块/模板块内容的折叠状态。
export const MarkdownActionFoldButton = ({
  isFolded,
  label,
  unfoldLabel,
  onToggle,
}: {
  isFolded: boolean
  label: string
  unfoldLabel: string
  onToggle: () => void
}): React.JSX.Element => (
  <LxTooltip content={isFolded ? unfoldLabel : label} placement="bottom">
    <button
      aria-label={isFolded ? unfoldLabel : label}
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

// 状态按钮：循环切换模板块结束行的状态标记。
export const TemplateStatusButton = ({
  status,
  onToggle,
}: {
  status: MarkdownTemplateStatus
  onToggle: () => void
}): React.JSX.Element => {
  const [isHovered, setIsHovered] = useState(false)
  const StatusIcon =
    status === "done" ? CheckCircle2 : status === "in_progress" ? CircleDot : Circle
  const label = TEMPLATE_STATUS_NEXT_LABEL[status]

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
