import { Plus, Terminal as TerminalIcon, X } from "lucide-react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import type { TerminalTabItem } from "@/features/terminal/types"

interface TerminalTabsProps {
  onAddTab: () => void
}

/**
 * Ghostty 风格左侧终端标签列表栏。
 */
export const TerminalTabs = ({ onAddTab }: TerminalTabsProps): React.JSX.Element => {
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
    <div className="flex h-full w-[148px] shrink-0 flex-col border-r border-white/5 bg-[#171717] select-none">
      {/* 顶部标题与新建按钮 */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/5 px-2">
        <div className="flex items-center gap-1.5 text-white/50">
          <TerminalIcon className="h-3.5 w-3.5" />
          <span className="text-[11px] font-medium tracking-wider uppercase">终端</span>
        </div>
        <LxIconButton
          aria-label="新建终端"
          size="small"
          title={{ content: "新建终端", placement: "top" }}
          onClick={onAddTab}
        >
          <Plus className="h-3.5 w-3.5 text-white/60 hover:text-white" />
        </LxIconButton>
      </div>

      {/* 标签列表 */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-1 space-y-0.5">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isEditing = editingTabId === tab.id

          return (
            <div
              key={tab.id}
              className={`group flex h-7 items-center justify-between rounded-[4px] px-2 text-xs transition-colors cursor-pointer ${
                isActive
                  ? "border border-white/10 bg-white/[0.08] font-medium text-white"
                  : "text-white/60 hover:bg-white/[0.04] hover:text-white/90"
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
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
                className={`ml-1 flex shrink-0 items-center transition-opacity ${
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

        {tabs.length === 0 && (
          <div className="flex h-20 flex-col items-center justify-center px-2 text-center text-white/30">
            <span className="text-[11px]">无活动终端</span>
          </div>
        )}
      </div>
    </div>
  )
}
