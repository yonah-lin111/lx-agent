import type React from "react"
import type { CSSProperties } from "react"
import {
  panelClassName,
  useActiveItemScrollIntoView,
  usePanelAnimation,
} from "@/features/agent/components/AgentInput"

export interface OpenClawPickerItem {
  id: string
  label: string
  hint?: string
  selected?: boolean
}

export interface OpenClawPickerPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  title: string
  emptyText: string
  items: OpenClawPickerItem[]
  activeIndex: number
  onSelect?: (item: OpenClawPickerItem) => void
}

interface OpenClawPickerDisplayData {
  position: CSSProperties
  title: string
  emptyText: string
  items: OpenClawPickerItem[]
  activeIndex: number
}

/**
 * OpenClaw 选择面板：`/office` 切换办公区、`/clear` 选择员工会话。
 * 动画过渡、滚动定位与样式严格对齐 AgentInput 的二级面板（AgentInputModelPanel）。
 */
export const OpenClawPickerPanel = ({
  isOpen,
  position,
  title,
  emptyText,
  items,
  activeIndex,
  onSelect,
}: OpenClawPickerPanelProps): React.JSX.Element | null => {
  // 标题为空表示父级未提供面板数据；关闭期间保留最后数据播放退场动画。
  const hasData = position !== null && title !== ""
  const animated = usePanelAnimation<OpenClawPickerDisplayData>(
    isOpen && hasData,
    hasData ? { position, title, emptyText, items, activeIndex } : null,
  )
  const panelRef = useActiveItemScrollIntoView(
    isOpen,
    position,
    animated?.displayData.activeIndex ?? 0,
  )
  if (!animated) return null

  const {
    position: displayPosition,
    title: displayTitle,
    emptyText: displayEmptyText,
    items: displayItems,
    activeIndex: displayIndex,
  } = animated.displayData

  return (
    <div
      ref={panelRef}
      role="listbox"
      aria-label={displayTitle}
      className={`${panelClassName} ${
        animated.isAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"
      }`}
      style={displayPosition}
    >
      <div className="px-2 py-1 text-[11px] text-white/40">{displayTitle}</div>
      {displayItems.length === 0 ? (
        <div className="px-2 py-2 text-[12px] text-white/45">{displayEmptyText}</div>
      ) : (
        displayItems.map((item, index) => {
          const isActive = index === displayIndex
          return (
            <div
              key={item.id}
              role="option"
              data-index={index}
              aria-selected={isActive}
              className={`flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1 text-left transition-colors ${
                isActive ? "bg-white/8 text-white" : "text-white/75 hover:bg-white/5"
              }`}
              onMouseDown={(event) => {
                event.preventDefault()
                onSelect?.(item)
              }}
            >
              <span
                className={`flex h-4 w-4 flex-none items-center justify-center rounded-[3px] border text-[10px] ${
                  item.selected
                    ? "border-sky-400/50 bg-sky-400/20 text-sky-300"
                    : "border-white/15 text-transparent"
                }`}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
              {item.hint ? (
                <span className="shrink-0 truncate text-[11px] text-white/40">{item.hint}</span>
              ) : null}
            </div>
          )
        })
      )}
    </div>
  )
}
