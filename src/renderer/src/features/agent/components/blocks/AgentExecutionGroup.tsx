import { ChevronDown } from "lucide-react"
import type React from "react"
import { useState } from "react"

// 执行折叠组件属性类型。
export interface AgentExecutionGroupProps {
  // 组内渲染内容列表（按调用顺序）。
  items: React.ReactNode[]
  // 初始是否展开。
  defaultExpanded?: boolean
}

/**
 * Agent 执行组组件：扁平折叠展示执行过程（只读工具、MCP、Skill、子代理、思考过程），支持整体展开/折叠。
 */
export const AgentExecutionGroup = ({
  items,
  defaultExpanded = false,
}: AgentExecutionGroupProps): React.JSX.Element | null => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded)

  if (items.length === 0) {
    return null
  }

  return (
    <div className="agent-execution-group my-0.5 flex min-w-0 flex-col gap-1">
      <button
        type="button"
        aria-expanded={isExpanded}
        className="agent-execution-group-header flex w-fit items-center gap-1.5 rounded-[4px] px-1 py-0.5 text-[12px] text-white/70 transition-colors hover:text-white/90 focus:outline-none"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <span
          aria-hidden
          className="agent-execution-group-dot h-1.5 w-1.5 shrink-0 rounded-full bg-white/80"
        />
        <span className="font-mono text-[12px] font-semibold text-white/90">Execute Group</span>
        <span className="text-[11px] text-white/40">({items.length})</span>
        <ChevronDown
          className={`h-3 w-3 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: isExpanded ? "1fr" : "0fr",
          opacity: isExpanded ? 1 : 0,
          transition:
            "grid-template-rows 0.2s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.2s cubic-bezier(0.2, 0.85, 0.2, 1)",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="relative ml-2 flex min-w-0 flex-col gap-1.5 border-l border-white/10 pl-3 py-1">
            {items.map((itemNode, itemIndex) => (
              <div key={itemIndex} className="agent-execution-item min-w-0">
                {itemNode}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

