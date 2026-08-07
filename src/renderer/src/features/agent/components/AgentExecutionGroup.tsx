import { ChevronDown } from "lucide-react"
import type React from "react"
import { Fragment, useLayoutEffect, useRef, useState } from "react"

// 时间轴子项（带类型以匹配小圆点颜色）。
export type ExecutionGroupItem = {
  kind: "tool" | "thinking" | "mcp" | "webSearch"
  node: React.ReactNode
}

// 执行折叠组件属性类型。
interface AgentExecutionGroupProps {
  // 组内渲染内容（每项带类型，用于时间轴小圆点配色）。
  items: ExecutionGroupItem[]
  // 组内工具数量。
  toolCount: number
  // 组内思考块数量。
  thinkingCount: number
  // 组内 MCP 调用数量。
  mcpCount: number
  // 组内联网搜索调用数量。
  webSearchCount: number
}

// 工具、思考、MCP 与联网搜索调用合计数量达到该阈值时默认折叠执行内容。
const EXECUTION_GROUP_COLLAPSE_THRESHOLD = 2

// 各类别计数展示片段（数字与类别词统一颜色）。
type CountSegment = {
  count: number
  singular: string
  plural: string
}

// 时间轴小圆点按类型的填充色（实心圆点）。
const DOT_COLOR: Record<ExecutionGroupItem["kind"], string> = {
  tool: "bg-amber-300",
  thinking: "bg-rose-300",
  mcp: "bg-cyan-300",
  webSearch: "bg-emerald-300",
}

/**
 * 工具、思考与 MCP 调用合计数量达到阈值时默认折叠执行内容。
 */
export const AgentExecutionGroup = ({
  items,
  toolCount,
  thinkingCount,
  mcpCount,
  webSearchCount,
}: AgentExecutionGroupProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const isCollapsible =
    toolCount + thinkingCount + mcpCount + webSearchCount >= EXECUTION_GROUP_COLLAPSE_THRESHOLD
  const countSegments: CountSegment[] = [
    {
      count: toolCount,
      singular: "Tool Call",
      plural: "Tool Calls",
    },
    {
      count: thinkingCount,
      singular: "Thought",
      plural: "Thoughts",
    },
    {
      count: mcpCount,
      singular: "MCP Call",
      plural: "MCP Calls",
    },
    {
      count: webSearchCount,
      singular: "Web Search",
      plural: "Web Searches",
    },
  ].filter((segment) => segment.count > 0)

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
  }, [items, isExpanded])

  if (!isCollapsible) {
    return (
      <>
        {items.map((item, index) => (
          <Fragment key={index}>{item.node}</Fragment>
        ))}
      </>
    )
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
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-current" />
        <span>
          {countSegments.map((segment, index) => (
            <Fragment key={segment.plural}>
              {index > 0 && <span className="px-1">·</span>}
              <span>{segment.count}</span>
              <span className="ml-0.5">
                {segment.count === 1 ? segment.singular : segment.plural}
              </span>
            </Fragment>
          ))}
        </span>
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
        <div ref={innerRef} className="relative flex min-w-0 flex-col gap-1.5">
          <span aria-hidden className="absolute bottom-0 left-[4px] top-0 w-px bg-white/10" />
          {items.map((item, index) => (
            <div key={index} className="relative pl-4 [&>*:first-child]:mt-0">
              {item.node}
              <span
                aria-hidden
                className={`absolute left-[1px] top-[5px] h-2 w-2 rounded-full ${DOT_COLOR[item.kind]}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
