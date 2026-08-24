import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"

// Markdown 斜杠命令菜单属性。
interface MarkdownSlashCommandMenuProps {
  commands?: MarkdownSlashCommand[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
}

const getCommandTags = (command: MarkdownSlashCommand): { label: string; bgClass: string }[] => {
  const tags: { label: string; bgClass: string }[] = []

  const isScopeBoth =
    command.scope === "both" ||
    (command.kind === "customTemplate" && command.customScope === "global")

  if (
    command.kind === "customTemplate" ||
    command.source === "project" ||
    command.source === "user"
  ) {
    // 作用域 Tag（MD / Template / MD & Template）
    if (isScopeBoth) {
      tags.push({ label: "MD / Template", bgClass: "bg-teal-500/20 text-teal-300" })
    } else if (command.customScope === "template" || command.scope === "template") {
      tags.push({ label: "Template", bgClass: "bg-purple-500/20 text-purple-300" })
    } else {
      tags.push({ label: "MD", bgClass: "bg-sky-500/20 text-sky-300" })
    }

    // 格式为 Custom|Global 或 Custom|Project
    const customSourceLabel = command.source === "project" ? "Custom|Project" : "Custom|Global"
    tags.push({ label: customSourceLabel, bgClass: "bg-amber-500/20 text-amber-300" })
  } else {
    // 内置命令：如果支持双作用域，打上 MD / Template 标记
    if (isScopeBoth) {
      tags.push({ label: "MD / Template", bgClass: "bg-teal-500/20 text-teal-300" })
    } else if (command.scope === "template") {
      tags.push({ label: "Template", bgClass: "bg-purple-500/20 text-purple-300" })
    }
    tags.push({ label: "Builtin", bgClass: "bg-white/10 text-white/50" })
  }

  return tags
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
 * 渲染紧贴编辑器光标的 Markdown 模板命令菜单。
 */
export const MarkdownSlashCommandMenu = ({
  commands,
  activeIndex = 0,
  position,
  visible = false,
}: MarkdownSlashCommandMenuProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const [isAnimatingOut, setIsAnimatingOut] = useState(false)

  const lastDataRef = useRef<{
    commands: MarkdownSlashCommand[]
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

  const displayData =
    visible && commands && position ? { commands, activeIndex, position } : lastDataRef.current

  const panelRef = useActiveItemScrollIntoView(
    shouldRender && visible,
    displayData?.position ?? null,
    displayData?.activeIndex ?? 0,
  )

  if (!shouldRender || !displayData) return null

  const {
    commands: displayCommands,
    activeIndex: displayActiveIndex,
    position: displayPosition,
  } = displayData

  const renderCommandItem = (command: MarkdownSlashCommand, index: number): React.JSX.Element => {
    const isActive = index === displayActiveIndex
    const tags = getCommandTags(command)

    return (
      <div
        key={command.id}
        data-index={index}
        aria-selected={isActive}
        className={`flex h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left transition-colors ${
          isActive ? "bg-white/8 text-white" : "text-white/75"
        }`}
        role="option"
      >
        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 text-[13px] text-white/70">
          /
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-[13px] leading-none text-white">{command.label}</span>
          <span className="min-w-0 flex-1 truncate text-[12px] leading-none text-white/45">
            {command.description}
          </span>
        </span>
        {tags.length > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {tags.map((tag) => (
              <LxTag
                key={tag.label}
                bgClass={tag.bgClass}
                className="pointer-events-none shrink-0"
                size="small"
              >
                {tag.label}
              </LxTag>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      ref={panelRef}
      aria-label="Markdown 模板命令"
      className={`markdown-command-menu markdown-command-menu--slash pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      role="listbox"
      style={displayPosition}
    >
      {displayCommands.map((command, index) => renderCommandItem(command, index))}
    </div>
  )
}
