import { ChevronDown, CornerDownRight } from "lucide-react"
import type React from "react"
import { Fragment, useMemo, useState } from "react"

// 执行条目类型。
export type ExecutionItemType = "thinking" | "tool" | "skill" | "mcp" | "webSearch"

// 执行条目配置信息。
export interface ExecutionItemMeta {
  type: ExecutionItemType
  dotColor: string
  node: React.ReactNode
}

// 执行折叠组件属性类型。
export interface AgentExecutionGroupProps {
  // 组内渲染内容列表（支持直接传入 React.ReactNode 或带有类型的结构）。
  items: (React.ReactNode | ExecutionItemMeta)[]
  // 初始是否展开。
  defaultExpanded?: boolean
}

/**
 * 统计各类型调用次数。
 */
const countExecutionTypes = (
  items: (React.ReactNode | ExecutionItemMeta)[],
): { thinking: number; tool: number; skill: number; mcp: number; webSearch: number } => {
  const counts = { thinking: 0, tool: 0, skill: 0, mcp: 0, webSearch: 0 }
  for (const item of items) {
    if (item && typeof item === "object" && "type" in item) {
      const type = (item as ExecutionItemMeta).type
      if (type in counts) counts[type]++
    } else {
      // 兜底为 tool
      counts.tool++
    }
  }
  return counts
}

/**
 * 获取执行条目的圆点颜色与节点。
 */
const resolveItemMeta = (
  item: React.ReactNode | ExecutionItemMeta,
): { dotColor: string; node: React.ReactNode } => {
  if (item && typeof item === "object" && "type" in item && "dotColor" in item) {
    const meta = item as ExecutionItemMeta
    return { dotColor: meta.dotColor, node: meta.node }
  }
  return { dotColor: "bg-amber-300", node: item as React.ReactNode }
}

/**
 * Agent 执行组组件：扁平折叠展示执行过程（只读工具、MCP、Skill、思考过程），
 * 带有调用统计行与被垂直左侧线贯穿的彩色小圆点时间线。
 */
export const AgentExecutionGroup = ({
  items,
  defaultExpanded = false,
}: AgentExecutionGroupProps): React.JSX.Element | null => {
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded)

  const counts = useMemo(() => countExecutionTypes(items), [items])

  const statsSegments = useMemo(
    () =>
      [
        { count: counts.thinking, singular: "Thought", plural: "Thoughts" },
        { count: counts.tool, singular: "Tool Call", plural: "Tool Calls" },
        { count: counts.skill, singular: "Skill Call", plural: "Skill Calls" },
        { count: counts.mcp, singular: "MCP Call", plural: "MCP Calls" },
        { count: counts.webSearch, singular: "Web Search", plural: "Web Searches" },
      ].filter((segment) => segment.count > 0),
    [counts],
  )

  if (items.length === 0) {
    return null
  }

  return (
    <div className="agent-execution-group my-0.5 flex min-w-0 flex-col gap-1">
      {/* 顶部折叠按钮 */}
      <button
        type="button"
        aria-expanded={isExpanded}
        className="agent-execution-group-header flex w-fit items-center gap-1.5 rounded-[4px] py-0.5 pr-1 text-[12px] text-white/70 transition-colors hover:text-white/90 focus:outline-none"
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

      {/* 直角 icon 与类型汇总统计行 */}
      {statsSegments.length > 0 && (
        <div className="agent-execution-group-stats-row flex min-w-0 items-start gap-1 pl-1 text-[12px] text-white/45">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/40" />
          <span className="agent-execution-group-stats flex min-w-0 flex-1 flex-wrap items-center leading-relaxed">
            {statsSegments.map((segment, index) => (
              <Fragment key={segment.plural}>
                {index > 0 && <span className="px-1 text-white/25">·</span>}
                <span>{segment.count}</span>
                <span className="ml-0.5">
                  {segment.count === 1 ? segment.singular : segment.plural}
                </span>
              </Fragment>
            ))}
          </span>
        </div>
      )}

      {/* 展开的条目列表：左侧贯穿轴线 + 节点对齐小圆点 */}
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
          <div className="relative ml-2.5 flex min-w-0 flex-col gap-2 border-l border-white/10 pl-3 py-1">
            {items.map((item, itemIndex) => {
              const { dotColor, node } = resolveItemMeta(item)
              return (
                <div key={itemIndex} className="agent-execution-item relative min-w-0">
                  {/* 左侧贯穿线上的彩色小圆点，精准与 20px 高的 header 中线（10px）居中对齐 */}
                  <span
                    aria-hidden
                    className={`absolute -left-[15.5px] top-[9px] h-1.5 w-1.5 rounded-full ring-2 ring-[#303030] ${dotColor}`}
                  />
                  {node}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
