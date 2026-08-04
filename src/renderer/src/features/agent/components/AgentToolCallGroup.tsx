import { ChevronDown } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"

// 工具折叠组件属性类型。
interface AgentToolCallGroupProps {
  // 组内渲染内容。
  children: React.ReactNode
  // 组内工具数量，思考块不计入数量。
  toolCount: number
}

const TOOL_COLLAPSE_THRESHOLD = 2

/**
 * 工具数量达到阈值时默认折叠执行内容。
 */
export const AgentToolCallGroup = ({
  children,
  toolCount,
}: AgentToolCallGroupProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const isCollapsible = toolCount >= TOOL_COLLAPSE_THRESHOLD

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
        aria-label={isExpanded ? "收起工具调用" : "展开工具调用"}
        className="flex h-5 w-fit items-center gap-1 rounded-[6px] bg-[#212121] pr-2 text-[12px] text-white/50 transition-all duration-200 hover:bg-[#212121]/80 hover:text-white/70 focus:outline-none"
        onClick={() => setIsExpanded((previous) => !previous)}
      >
        <span className="text-amber-400">{toolCount} Tool Calls</span>
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
