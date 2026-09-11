import type React from "react"
import type { CSSProperties } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

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
}

/**
 * OpenClaw 选择面板：`/office` 切换办公区、`/agent` 切换员工选中。
 */
export const OpenClawPickerPanel = ({
  isOpen,
  position,
  title,
  emptyText,
  items,
  activeIndex,
}: OpenClawPickerPanelProps): React.JSX.Element | null => {
  const [shouldRender, setShouldRender] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true)
      return
    }
    const timer = setTimeout(() => setShouldRender(false), 120)
    return () => clearTimeout(timer)
  }, [isOpen])

  useLayoutEffect(() => {
    const container = panelRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
    active?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, isOpen])

  if (!shouldRender || position === null) return null

  return (
    <div
      ref={panelRef}
      role="listbox"
      aria-label={title}
      className={`scrollbar-hidden pointer-events-none fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] ${
        isOpen ? "animate-tooltip-in" : "animate-tooltip-out"
      }`}
      style={position}
    >
      <div className="px-2 py-1 text-[11px] text-white/40">{title}</div>
      {items.length === 0 ? (
        <div className="px-2 py-2 text-[12px] text-white/45">{emptyText}</div>
      ) : (
        items.map((item, index) => {
          const isActive = index === activeIndex
          return (
            <div
              key={item.id}
              role="option"
              data-index={index}
              aria-selected={isActive}
              className={`flex min-h-9 w-full items-center gap-2 rounded-[4px] px-2 py-1 text-left transition-colors ${
                isActive ? "bg-white/8 text-white" : "text-white/75"
              }`}
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
