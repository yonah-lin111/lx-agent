import type React from "react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { panelClassName } from "@/features/agent/components/AgentInput"

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
  const panelData = hasData ? { position, activeIndex, title, emptyText, items } : null

  return (
    <LxCommandPanel
      ariaLabel={title}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          <div className="px-2 py-1 text-[11px] text-white/40">{displayData.title}</div>
          {displayData.items.length === 0 ? (
            <div className="px-2 py-2 text-[12px] text-white/45">{displayData.emptyText}</div>
          ) : (
            displayData.items.map((item, index) => (
              <LxCommandPanelItem
                key={item.id}
                active={index === displayData.activeIndex}
                className="flex min-h-9 items-center gap-2 px-2 py-1"
                index={index}
                leading={
                  <span
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded-[3px] border text-[10px] ${
                      item.selected
                        ? "border-sky-400/50 bg-sky-400/20 text-sky-300"
                        : "border-white/15 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                }
                onSelect={() => onSelect?.(item)}
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{item.label}</span>
                {item.hint ? (
                  <span className="shrink-0 truncate text-[11px] text-white/40">{item.hint}</span>
                ) : null}
              </LxCommandPanelItem>
            ))
          )}
        </>
      )}
    </LxCommandPanel>
  )
}
