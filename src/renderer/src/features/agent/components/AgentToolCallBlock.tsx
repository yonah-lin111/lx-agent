import { CornerDownRight } from "lucide-react"
import type React from "react"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
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
  // 是否位于折叠工具组中。
  isGrouped?: boolean
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
 * 按工具类型生成调用摘要，避免将结果正文混入命令展示。
 */
const formatToolCommand = (toolName: string, args: Record<string, unknown>): string | null => {
  const path = typeof args.path === "string" ? args.path : "."
  if (toolName === "edit" || toolName === "write") return `${toolName} ${path}`
  if (toolName === "find") return `find ${String(args.pattern ?? "")} ${path}`.trim()
  if (toolName === "grep") return `grep ${String(args.pattern ?? "")} ${path}`.trim()
  if (toolName === "ls") return `ls ${path}`.trim()
  if (toolName === "bash") return typeof args.command === "string" ? args.command : "bash"
  return null
}

/**
 * 将连续的同名工具调用合并为单行摘要，条目间使用该工具专属分隔符。
 */
const formatToolGroupSummary = (toolName: string, toolCalls: ToolCallBlock[]): string => {
  const separator = TOOL_GROUP_SEPARATORS[toolName]
  if (!separator || toolCalls.length <= 1) return ""

  if (toolName === "read") {
    return getToolCallPaths(toolCalls).map(compactPath).join(separator)
  }

  const entries = toolCalls.map(({ args }) => {
    const path = typeof args.path === "string" ? compactPath(args.path) : null
    if (toolName === "ls") return path ?? "Unknown file"
    if (toolName === "find" || toolName === "grep") {
      return `${String(args.pattern ?? "")} ${path ?? "."}`.trim()
    }
    if (toolName === "bash") return typeof args.command === "string" ? args.command : "bash"
    return JSON.stringify(args)
  })
  return entries.join(separator)
}

/**
 * 渲染 Agent 工具调用与结果的时间线步骤。
 */
export const AgentToolCallBlock = ({
  toolCall,
  toolCalls,
  toolResult,
  isGrouped = false,
}: AgentToolCallBlockProps): React.JSX.Element | null => {
  if (!toolCall && !toolCalls?.length && !toolResult) return null

  const resolvedToolCalls = toolCalls?.length ? toolCalls : toolCall ? [toolCall] : []
  const firstToolCall = resolvedToolCalls[0]
  const toolName = firstToolCall?.toolName ?? toolResult?.toolName ?? "tool"
  const displayToolName = toolName.charAt(0).toUpperCase() + toolName.slice(1)
  const readPaths = getToolCallPaths(resolvedToolCalls)
  const simpleSummary = getSimpleToolSummary(toolName)
  const commandSummary = firstToolCall ? formatToolCommand(toolName, firstToolCall.args) : null
  const summary =
    commandSummary ??
    simpleSummary ??
    (toolResult ? formatToolResult(toolResult.text) : formatToolArgs(firstToolCall?.args ?? {}))
  const isSimpleTool = toolName === "read" || simpleSummary !== null || commandSummary !== null
  const groupSummary = formatToolGroupSummary(toolName, resolvedToolCalls)
  const summaryIndentClass = isGrouped ? "pl-4" : "pl-1"

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        {isGrouped && <CornerDownRight className="h-3 w-3 shrink-0 text-white/45" />}
        <span className="font-mono text-[12px] font-bold text-amber-300">{displayToolName}</span>
      </div>
      {isSimpleTool ? (
        <div
          className={`mt-1 flex min-w-0 items-start gap-1 ${summaryIndentClass} text-[12px] leading-relaxed text-white/45`}
        >
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
          {toolName === "read" ? (
            <span className="min-w-0 break-all">
              {readPaths.map(compactPath).join(TOOL_GROUP_SEPARATORS.read)}
            </span>
          ) : groupSummary ? (
            <span className="min-w-0 break-all">{groupSummary}</span>
          ) : (
            <span>{summary}</span>
          )}
        </div>
      ) : toolResult ? (
        <>
          <div
            className={`mt-1 flex min-w-0 items-start gap-1 ${summaryIndentClass} text-[12px] leading-relaxed text-white/45`}
          >
            <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
            <span className="min-w-0 break-all">{summary}</span>
          </div>
        </>
      ) : (
        <div
          className={`mt-1 flex min-w-0 items-start gap-1 ${summaryIndentClass} text-[12px] leading-relaxed text-white/45`}
        >
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
          <span className="min-w-0 break-all">{summary}</span>
        </div>
      )}
    </div>
  )
}
