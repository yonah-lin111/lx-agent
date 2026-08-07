import { ChevronDown, ListTree } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"

// 执行折叠组件属性类型。
interface AgentExecutionGroupProps {
  // 组内渲染内容。
  children: React.ReactNode
  // 组内工具数量。
  toolCount: number
  // 组内思考块数量。
  thinkingCount: number
  // 组内 MCP 调用数量。
  mcpCount: number
}

// 工具、思考与 MCP 调用合计数量达到该阈值时默认折叠执行内容。
const EXECUTION_GROUP_COLLAPSE_THRESHOLD = 2

// 按单复数拼接英文计数片段。
const formatCount = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`

/**
 * 工具、思考与 MCP 调用合计数量达到阈值时默认折叠执行内容。
 */
export const AgentExecutionGroup = ({
  children,
  toolCount,
  thinkingCount,
  mcpCount,
}: AgentExecutionGroupProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const isCollapsible = toolCount + thinkingCount + mcpCount >= EXECUTION_GROUP_COLLAPSE_THRESHOLD
  const countLabel = [
    toolCount > 0 ? formatCount(toolCount, "Tool Call", "Tool Calls") : "",
    thinkingCount > 0 ? formatCount(thinkingCount, "Thought", "Thoughts") : "",
    mcpCount > 0 ? formatCount(mcpCount, "MCP Call", "MCP Calls") : "",
  ]
    .filter(Boolean)
    .join(" · ")

  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element || !isExpanded) {
      setContentHeight(null)
      return undefined
    }

    const updateHeight = (): void => setContentHeight(element.scrollHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [children, isExpanded])

  if (!isCollapsible) {
    return <>{children}</>
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "收起执行内容" : "展开执行内容"}
        className="flex h-5 w-fit items-center gap-1 rounded-[6px] bg-[#212121] pr-2 text-[12px] text-white/50 transition-all duration-200 hover:bg-[#212121]/80 hover:text-white/70 focus:outline-none"
        onClick={() => setIsExpanded((previous) => !previous)}
      >
        <ListTree className="h-3.5 w-3.5 shrink-0 text-amber-400" />
        <span className="text-amber-400">{countLabel}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
        />
      </button>
      <div
        style={{
          maxHeight: isExpanded
            ? contentHeight !== null
              ? `${contentHeight}px`
              : `${innerRef.current?.scrollHeight ?? 0}px`
            : "0px",
          opacity: isExpanded ? 1 : 0,
          transition:
            "max-height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)",
        }}
        className="overflow-hidden"
      >
        <div ref={innerRef} className="flex min-w-0 flex-col gap-1.5">
          {children}
        </div>
      </div>
    </div>
  )
}
