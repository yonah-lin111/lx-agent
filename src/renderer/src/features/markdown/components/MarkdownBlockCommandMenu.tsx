import type { CSSProperties } from "react"
import { useEffect, useRef, useState } from "react"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"

// Markdown 块命令菜单属性。
interface MarkdownBlockCommandMenuProps {
  commands?: MarkdownBlockCommand[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

/**
 * 渲染紧贴编辑器光标的 Markdown 块命令菜单。
 */
export const MarkdownBlockCommandMenu = ({
  commands,
  activeIndex = 0,
  position,
  visible = false,
}: MarkdownBlockCommandMenuProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    commands: MarkdownBlockCommand[]
    activeIndex: number
    position: CSSProperties
  } | null>(null)

  if (visible && commands && position) {
    lastDataRef.current = { commands, activeIndex, position }
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
    visible && commands && position ? { commands, activeIndex, position } : lastDataRef.current
  if (!displayData) return null

  const {
    commands: displayCommands,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  return (
    <div
      aria-label="Markdown 块命令"
      className={`markdown-command-menu markdown-command-menu--block pointer-events-none fixed z-50 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayCommands.map((command, index) => {
        const Icon = command.icon
        const isActive = index === displayActiveIndex

        return (
          <div
            key={command.id}
            aria-selected={isActive}
            className={`flex h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs transition-colors ${
              isActive ? "bg-white/8 text-white" : "text-white/75"
            }`}
            role="option"
          >
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 text-white/70">
              <Icon className="h-3 w-3" />
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[13px] leading-none text-white">{command.label}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-none text-white/45">
                {command.preview}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
