import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownSendPromptOption } from "@/features/markdown/commands/markdownSlashCommands"
import { CliIcon } from "@/features/settings"
import { useTranslation } from "@/i18n"

// Prompt 发送目标选择面板属性。
interface MarkdownSendPromptCommandMenuProps {
  options?: MarkdownSendPromptOption[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

/**
 * 渲染紧贴编辑器光标的 Prompt 发送目标二级选择面板（/sendPrompt 二级面板）。
 */
export const MarkdownSendPromptCommandMenu = ({
  options,
  activeIndex = 0,
  position,
  visible = false,
}: MarkdownSendPromptCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    options: MarkdownSendPromptOption[]
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
      aria-label={t("markdown.sendPromptMenuLabel")}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-none fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayOptions.map((option, index) => {
        const isActive = index === displayActiveIndex
        const isRunning = Boolean(option.isRunning)
        const isDefault = Boolean(option.isDefault)

        const itemBgClass = isDefault
          ? isActive
            ? "bg-purple-500/20 text-white"
            : "bg-purple-500/10 text-white/90"
          : isRunning
            ? isActive
              ? "bg-emerald-500/20 text-white"
              : "bg-emerald-500/10 text-white/90"
            : isActive
              ? "bg-white/8 text-white"
              : "text-white/75"

        return (
          <div
            key={option.id}
            data-index={index}
            data-is-default={isDefault ? "true" : undefined}
            data-is-running={isRunning ? "true" : undefined}
            aria-selected={isActive}
            className={`flex min-h-8 w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left text-xs transition-colors mb-0.5 last:mb-0 ${itemBgClass}`}
            role="option"
          >
            <CliIcon id={option.targetType || option.id} className="h-3.5 w-3.5 flex-none" />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-3">

              <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 text-[13px] leading-none text-white">{option.label}</span>
                {option.description && (
                  <span className="min-w-0 truncate text-[12px] leading-none text-white/45">
                    {option.description}
                  </span>
                )}
              </span>
              <LxTag
                bgClass={
                  isDefault
                    ? "bg-purple-500/20 text-purple-300"
                    : isRunning
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "bg-white/10 text-white/50"
                }
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
