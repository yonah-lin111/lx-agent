import { Terminal as TerminalIcon, X } from "lucide-react"
import { useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import type { TerminalTabItem } from "@/features/terminal/types"

/**
 * Ghostty 风格顶部水平终端标签列表栏（纯标签横向滚动展示，与操作按钮高度一致为 h-7）。
 */
export const TerminalTabs = (): React.JSX.Element => {
  const tabs = useTerminalStore((state) => state.tabs)
  const activeTabId = useTerminalStore((state) => state.activeTabId)
  const setActiveTab = useTerminalStore((state) => state.setActiveTab)
  const removeTab = useTerminalStore((state) => state.removeTab)
  const updateTabTitle = useTerminalStore((state) => state.updateTabTitle)

  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState("")

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

  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden select-none">
      {/* 水平滚动标签列表 */}
      <div className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
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
    </div>
  )
}
