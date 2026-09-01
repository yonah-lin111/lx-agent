import { CornerDownLeft } from "lucide-react"
import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownSendPromptFlagOption } from "@/features/markdown/commands/markdownSlashCommands"
import { useTranslation } from "@/i18n"

// Prompt 运行标志位选择面板属性。
interface MarkdownSendPromptFlagCommandMenuProps {
  options?: MarkdownSendPromptFlagOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

/**
 * 渲染紧贴编辑器光标的 Prompt 发送标志位三级选择面板（/sendPrompt <target> - 三级面板）。
 */
export const MarkdownSendPromptFlagCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
}: MarkdownSendPromptFlagCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    options: MarkdownSendPromptFlagOption[]
    activeIndex: number
    position: CSSProperties
  } | null>(null)

  if (visible && options && position) {
    lastDataRef.current = { options, activeIndex, position }
  }

  useEffect(() => {
    if (visible) {
      setShouldRender(true)
      setIsAnimatingOut(false)
      return
    }
    if (!shouldRender) return

    setIsAnimatingOut(true)
    const timer = setTimeout(() => {
      setShouldRender(false)
      setIsAnimatingOut(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [visible, shouldRender])

  if (!shouldRender) return null

  const displayData =
    visible && options && position ? { options, activeIndex, position } : lastDataRef.current
  if (!displayData) return null

  const {
    options: displayOptions,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  return (
    <div
      aria-label={t("markdown.sendPromptFlagMenuLabel")}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayOptions.map((option, index) => {
        const isActive = index === displayActiveIndex

        return (
          <div
            key={option.id}
            data-index={index}
            aria-selected={isActive}
            className={`flex min-h-8 w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs transition-colors mb-0.5 last:mb-0 ${
              isActive ? "bg-white/8 text-white" : "text-white/75"
            }`}
            role="option"
          >
            <CornerDownLeft className="h-3.5 w-3.5 flex-none text-sky-400" />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <span className="shrink-0 text-[13px] font-mono leading-none text-white">
                {option.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] leading-none text-white/45">
                {option.description}
              </span>
              <LxTag
                bgClass="bg-sky-500/20 text-sky-300"
                className="pointer-events-none shrink-0"
                size="small"
              >
                {option.tag}
              </LxTag>
            </span>
          </div>
        )
      })}
    </div>
  )
}
