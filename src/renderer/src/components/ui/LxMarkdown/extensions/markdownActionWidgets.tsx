import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

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
  label?: string
}): React.JSX.Element => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | null>(null)
  const copyLabel = label ?? t("markdown.copyCode")

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

// 折叠按钮：切换代码块的折叠状态。
export const MarkdownActionFoldButton = ({
  isFolded,
  label,
  unfoldLabel,
  onToggle,
}: {
  isFolded: boolean
  label?: string
  unfoldLabel?: string
  onToggle: () => void
}): React.JSX.Element => {
  const { t } = useTranslation()
  const foldText = label ?? t("markdown.foldCode")
  const unfoldText = unfoldLabel ?? t("markdown.unfoldCode")

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
