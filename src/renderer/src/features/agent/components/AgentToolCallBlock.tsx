import { CornerDownRight } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 工具结果块类型。
type ToolResultBlock = Extract<ChatBlock, { kind: "toolResult" }>

// 工具调用展示组件属性类型。
interface AgentToolCallBlockProps {
  // 工具调用数据。
  toolCall?: ToolCallBlock
  // 同名工具调用数据。
  toolCalls?: ToolCallBlock[]
  // 工具结果数据。
  toolResult?: ToolResultBlock
  // 工具结果是否展开。
  isResultExpanded?: boolean
  // 切换工具结果展开状态的回调。
  onToggleResult?: () => void
}

/**
 * 将工具输入压缩为单行展示文本。
 */
const formatToolArgs = (args: Record<string, unknown>): string => {
  const summary = JSON.stringify(args)
  return summary.length > 96 ? `${summary.slice(0, 96)}...` : summary
}

/**
 * 将工具结果压缩为执行摘要。
 */
const formatToolResult = (text: string): string => {
  const normalizedText = text.trim().replace(/\s+/g, " ")
  return normalizedText.length > 96 ? `${normalizedText.slice(0, 96)}...` : normalizedText
}

/**
 * 返回需要隐藏参数和结果的工具摘要。
 */
const getSimpleToolSummary = (toolName: string): string | null => {
  if (toolName === "time") return "get current time"

  return null
}

// 路径摘要组件属性类型。
interface ToolPathSummaryProps {
  // 文件路径列表。
  paths: string[]
  // 是否展开路径列表。
  isExpanded?: boolean
  // 切换路径列表展开状态的回调。
  onToggle?: () => void
}

/**
 * 收缩路径中间段，保留根目录与最后两个路径段。
 */
const compactPath = (path: string): string => {
  const isAbsolute = path.startsWith("/")
  const segments = path.split("/").filter(Boolean)

  if (segments.length <= 3) return path

  return `${isAbsolute ? "/" : ""}${segments[0]}/.../${segments.slice(-2).join("/")}`
}

/**
 * 渲染文件路径列表，并在超过三行时提供折叠展开。
 */
const ToolPathSummary = ({
  paths,
  isExpanded,
  onToggle,
}: ToolPathSummaryProps): React.JSX.Element => {
  const [localIsExpanded, setLocalIsExpanded] = useState(false)
  const [isCollapsible, setIsCollapsible] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const displayText = paths.map(compactPath).join(", ")
  const expanded = isExpanded ?? localIsExpanded

  useLayoutEffect(() => {
    const container = containerRef.current
    const measureElement = measureRef.current
    if (!container || !measureElement) return undefined

    const updateCollapsible = (): void => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(measureElement).lineHeight) || 20
      setIsCollapsible(measureElement.scrollHeight > lineHeight * 3 + 1)
    }

    updateCollapsible()
    if (typeof ResizeObserver === "undefined") return undefined
    const observer = new ResizeObserver(updateCollapsible)
    observer.observe(container)

    return () => observer.disconnect()
  }, [displayText])

  const canToggle = isCollapsible || onToggle !== undefined
  const handleToggle = (): void => {
    if (!canToggle) return
    if (onToggle) {
      onToggle()
      return
    }
    setLocalIsExpanded((previousIsExpanded) => !previousIsExpanded)
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? "折叠文件路径" : "展开文件路径"}
      disabled={!canToggle}
      className={`relative block min-w-0 flex-1 p-0 text-left text-white/45 ${
        canToggle ? "cursor-pointer" : "cursor-default"
      }`}
      onClick={handleToggle}
    >
      <span ref={containerRef} className="relative block min-w-0">
        <span
          ref={measureRef}
          aria-hidden="true"
          className="invisible absolute inset-x-0 top-0 block break-all text-white/45"
        >
          {displayText}
        </span>
        <span className={`block break-all text-white/45 ${expanded ? "" : "line-clamp-3"}`}>
          {displayText}
        </span>
      </span>
    </button>
  )
}

/**
 * 从工具调用中提取需要展示的文件路径。
 */
const getToolCallPaths = (toolCalls: ToolCallBlock[]): string[] =>
  toolCalls.flatMap(({ args }) => {
    const path = args.path
    if (typeof path === "string") return [path]

    if (Array.isArray(path)) {
      const paths = path.filter((item): item is string => typeof item === "string")
      if (paths.length > 0) return paths
    }

    return ["Unknown file"]
  })

/**
 * 渲染 Agent 工具调用与结果的时间线步骤。
 */
export const AgentToolCallBlock = ({
  toolCall,
  toolCalls,
  toolResult,
  isResultExpanded = false,
  onToggleResult,
}: AgentToolCallBlockProps): React.JSX.Element | null => {
  if (!toolCall && !toolCalls?.length && !toolResult) return null

  const resolvedToolCalls = toolCalls?.length ? toolCalls : toolCall ? [toolCall] : []
  const firstToolCall = resolvedToolCalls[0]
  const toolName = firstToolCall?.toolName ?? toolResult?.toolName ?? "tool"
  const displayToolName = toolName.charAt(0).toUpperCase() + toolName.slice(1)
  const readPaths = getToolCallPaths(resolvedToolCalls)
  const simpleSummary = getSimpleToolSummary(toolName)
  const summary =
    simpleSummary ??
    (toolResult ? formatToolResult(toolResult.text) : formatToolArgs(firstToolCall?.args ?? {}))
  const isSimpleTool = toolName === "read" || simpleSummary !== null

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <span className="font-mono text-[12px] font-bold text-amber-300">{displayToolName}</span>
      </div>
      {isSimpleTool ? (
        <div className="mt-1 flex min-w-0 items-start gap-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
          {toolName === "read" ? (
            <ToolPathSummary
              paths={readPaths.length > 0 ? readPaths : ["Unknown file"]}
              isExpanded={onToggleResult ? isResultExpanded : undefined}
              onToggle={onToggleResult}
            />
          ) : (
            <span>{summary}</span>
          )}
        </div>
      ) : toolResult ? (
        <>
          <button
            type="button"
            aria-expanded={isResultExpanded}
            aria-label={`${toolName} 工具结果`}
            className="mt-1 flex min-w-0 items-start gap-1 text-left text-[12px] leading-relaxed text-white/45"
            onClick={onToggleResult}
          >
            <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
            <span className="min-w-0 break-all">{summary}</span>
          </button>
          {isResultExpanded && (
            <pre className="custom-scrollbar mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-relaxed text-white/60">
              {toolResult.text}
            </pre>
          )}
        </>
      ) : (
        <div className="mt-1 flex min-w-0 items-start gap-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
          <span className="min-w-0 break-all">{summary}</span>
        </div>
      )}
    </div>
  )
}
