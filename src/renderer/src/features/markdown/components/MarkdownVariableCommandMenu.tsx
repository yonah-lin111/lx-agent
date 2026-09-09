import { Braces } from "lucide-react"
import type React from "react"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import {
  getVariableTag,
  type MarkdownVariableEntry,
} from "@/features/markdown/commands/markdownVariableCommands"
import { useTranslation } from "@/i18n"

// 页面变量菜单属性。
export interface MarkdownVariableCommandMenuProps {
  variables?: MarkdownVariableEntry[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  triggerChar?: "$" | "¥"
  onSelect?: (variable: MarkdownVariableEntry) => void
}

/**
 * 激活项与面板边缘保持间距，避免上下键移动时被裁切。
 */
const useActiveItemScrollIntoView = (
  isOpen: boolean,
  position: CSSProperties | null,
  activeIndex: number,
): React.RefObject<HTMLDivElement | null> => {
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!isOpen || !position) return
    const container = panelRef.current
    if (!container) return

    const activeElement = container.querySelector(
      `[data-index="${activeIndex}"]`,
    ) as HTMLElement | null
    if (!activeElement) return

    const scrollPadding = 4
    const containerRect = container.getBoundingClientRect()
    const activeRect = activeElement.getBoundingClientRect()

    if (activeRect.top < containerRect.top + scrollPadding) {
      container.scrollTop -= containerRect.top + scrollPadding - activeRect.top
    } else if (activeRect.bottom > containerRect.bottom - scrollPadding) {
      container.scrollTop += activeRect.bottom - (containerRect.bottom - scrollPadding)
    }
  }, [isOpen, position, activeIndex])

  return panelRef
}

/**
 * 渲染紧贴编辑器光标的 Markdown 页面预设变量命令菜单。
 */
export const MarkdownVariableCommandMenu = ({
  variables,
  activeIndex = 0,
  position,
  visible = false,
  triggerChar = "$",
  onSelect,
}: MarkdownVariableCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    variables: MarkdownVariableEntry[]
    activeIndex: number
    position: CSSProperties
  } | null>(null)

  if (visible && variables && position) {
    lastDataRef.current = { variables, activeIndex, position }
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

  const displayData =
    visible && variables && position ? { variables, activeIndex, position } : lastDataRef.current

  const panelRef = useActiveItemScrollIntoView(
    shouldRender && visible,
    displayData?.position ?? null,
    displayData?.activeIndex ?? 0,
  )

  if (!shouldRender || !displayData) return null

  const {
    variables: displayVariables,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  return (
    <div
      ref={panelRef}
      aria-label={t("markdown.variableMenuAria")}
      className={`markdown-command-menu markdown-command-menu--file pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayVariables.map((variable, index) => {
        const isActive = index === displayActiveIndex
        const preview = variable.value.replaceAll("\n", " ").trim()

        return (
          <div
            key={variable.name}
            data-index={index}
            aria-selected={isActive}
            className={`group relative flex min-h-11 w-full cursor-pointer flex-col justify-center rounded-[4px] px-2 py-1 text-left transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75 hover:bg-white/5"
            }`}
            role="option"
            onMouseDown={(event) => {
              event.preventDefault()
              onSelect?.(variable)
            }}
          >
            <div className="flex w-full items-center gap-2">
              <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[3px] bg-amber-400/10 text-amber-300">
                <Braces className="h-3 w-3" />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="shrink-0 font-mono text-[13px] font-medium text-white">
                  {triggerChar}
                  {variable.name}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/45">
                  {preview || t("markdown.variableNoPreview")}
                </span>
              </span>
              <LxTag
                bgClass="border-amber-400/20 bg-amber-400/10 text-amber-300"
                className="pointer-events-none shrink-0"
                size="small"
              >
                {getVariableTag(variable.name)}
              </LxTag>
            </div>
            {isActive && (
              <div className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded border border-white/5 bg-black/20 p-1.5 font-mono text-[11px] text-white/60">
                {variable.value || t("markdown.variableNoPreview")}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
