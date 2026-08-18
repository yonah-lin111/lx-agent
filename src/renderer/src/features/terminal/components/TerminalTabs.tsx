import { ChevronLeft, ChevronRight, Terminal as TerminalIcon, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import type { TerminalTabItem } from "@/features/terminal/types"

/**
 * Ghostty 风格顶部水平终端标签列表栏（带左右滚动控制与滚轮横向滚动支持）。
 */
export const TerminalTabs = (): React.JSX.Element => {
  const tabs = useTerminalStore((state) => state.tabs)
  const activeTabId = useTerminalStore((state) => state.activeTabId)
  const setActiveTab = useTerminalStore((state) => state.setActiveTab)
  const removeTab = useTerminalStore((state) => state.removeTab)
  const updateTabTitle = useTerminalStore((state) => state.updateTabTitle)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const handleStartRename = (tab: TerminalTabItem): void => {
    setEditingTabId(tab.id)
    setEditingTitle(tab.title)
  }

  const handleSaveRename = (id: string): void => {
    if (editingTitle.trim()) {
      updateTabTitle(id, editingTitle.trim())
    }
    setEditingTabId(null)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, id: string): void => {
    if (event.key === "Enter") {
      event.preventDefault()
      handleSaveRename(id)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setEditingTabId(null)
    }
  }

  const updateScrollState = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 1)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateScrollState()

    const onScroll = (): void => updateScrollState()
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })

    const observer = new ResizeObserver(() => updateScrollState())
    observer.observe(el)

    return () => {
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      observer.disconnect()
    }
  }, [tabs, updateScrollState])

  const handleScroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = direction === "left" ? -150 : 150
    el.scrollBy({ left: scrollAmount, behavior: "smooth" })
  }, [])

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden select-none">
      {/* 最左侧：向左滚动按钮 */}
      <LxIconButton
        aria-label="向左滚动"
        disabled={!canScrollLeft}
        size="small"
        onClick={() => handleScroll("left")}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </LxIconButton>

      {/* 中间：水平滚动标签列表 */}
      <div
        ref={scrollRef}
        className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isEditing = editingTabId === tab.id

          return (
            <div
              key={tab.id}
              className={`group flex h-7 max-w-[160px] min-w-[80px] shrink-0 items-center gap-1.5 rounded-[4px] px-2.5 text-xs transition-colors cursor-pointer ${
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {/* 每个 Tab 项左侧的小终端图标 */}
              <TerminalIcon
                className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white/70" : "text-white/30"}`}
              />

              {isEditing ? (
                <input
                  autoFocus
                  className="h-5 w-full rounded-[2px] border border-white/20 bg-black/60 px-1 text-xs text-white outline-none"
                  value={editingTitle}
                  onBlur={() => handleSaveRename(tab.id)}
                  onChange={(e) => setEditingTitle(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => handleKeyDown(e, tab.id)}
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    handleStartRename(tab)
                  }}
                >
                  {tab.title}
                </span>
              )}

              <div
                className={`flex shrink-0 items-center transition-opacity ${
                  isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              >
                <LxTooltip content="关闭标签" placement="top">
                  <button
                    aria-label="关闭标签"
                    className="flex h-4 w-4 items-center justify-center rounded-[3px] text-white/40 hover:bg-white/10 hover:text-white"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTab(tab.id)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </LxTooltip>
              </div>
            </div>
          )
        })}
      </div>

      {/* 最右侧：向右滚动按钮 */}
      <LxIconButton
        aria-label="向右滚动"
        disabled={!canScrollRight}
        size="small"
        onClick={() => handleScroll("right")}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </LxIconButton>
    </div>
  )
}
