import type { LucideIcon } from "lucide-react"
import {
  ChevronDown,
  Clock,
  CornerDownRight,
  FileText,
  FolderOpen,
  FolderSearch,
  Pencil,
  PenLine,
  SearchCode,
  Terminal,
  Wrench,
} from "lucide-react"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
import type { AgentDiff, AgentDiffLine, ChatBlock } from "@/features/agent/types"
import { highlightCode, languageFromFileName } from "@/lib/codeHighlight"

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
  // 写/编辑工具的结构化 diff（随 toolCall 配套传入，用于折叠展示）。
  diff?: AgentDiff
  // 流式输出中默认展开（AI 实时输出可见变更），历史回看默认折叠。
  defaultExpanded?: boolean
}

// 展开态内容最大高度（超出内部滚动，与折叠动画的目标高度）。
const MAX_CONTENT_HEIGHT = 320

// 行首符号配色（新增 + / 删除 − / 上下文空白）。
const SIGN_COLORS: Record<AgentDiffLine["type"], string> = {
  add: "text-emerald-300",
  del: "text-red-300",
  context: "text-white/30",
}

// 增删行极浅背景（仅弱化区分变更行，不覆盖语法高亮）。
const ROW_BACKGROUND: Record<AgentDiffLine["type"], string> = {
  add: "bg-emerald-500/5",
  del: "bg-red-500/5",
  context: "",
}

// 行首符号（新增 + / 删除 − / 上下文空白）。
const getSign = (line: AgentDiffLine): string => {
  if (line.type === "add") return "+"
  if (line.type === "del") return "−"
  return " "
}

// 展示行号：新增用新文件行号，删除用旧文件行号，上下文优先新文件行号。
const getLineNumber = (line: AgentDiffLine): string => {
  if (line.type === "add") return line.newLine !== undefined ? String(line.newLine) : ""
  if (line.type === "del") return line.oldLine !== undefined ? String(line.oldLine) : ""
  return line.newLine !== undefined ? String(line.newLine) : ""
}

// 将工具输入压缩为单行展示文本。
const formatToolArgs = (args: Record<string, unknown>): string => {
  const summary = JSON.stringify(args)
  return summary.length > 96 ? `${summary.slice(0, 96)}...` : summary
}

// 将工具结果压缩为执行摘要。
const formatToolResult = (text: string): string => {
  const normalizedText = text.trim().replace(/\s+/g, " ")
  return normalizedText.length > 96 ? `${normalizedText.slice(0, 96)}...` : normalizedText
}

// 返回需要隐藏参数和结果的工具摘要。
const getSimpleToolSummary = (toolName: string): string | null => {
  if (toolName === "time") return "get current time"

  return null
}

// 收缩路径中间段，保留根目录与最后两个路径段。
const compactPath = (path: string): string => {
  const isAbsolute = path.startsWith("/")
  const segments = path.split("/").filter(Boolean)

  if (segments.length <= 3) return path

  return `${isAbsolute ? "/" : ""}${segments[0]}/.../${segments.slice(-2).join("/")}`
}

// 从工具调用中提取需要展示的文件路径。
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

// 按工具类型生成调用摘要，避免将结果正文混入命令展示。
const formatToolCommand = (toolName: string, args: Record<string, unknown>): string | null => {
  const path = typeof args.path === "string" ? args.path : "."
  if (toolName === "edit" || toolName === "write") return `${toolName} ${path}`
  if (toolName === "find") return `find ${String(args.pattern ?? "")} ${path}`.trim()
  if (toolName === "grep") return `grep ${String(args.pattern ?? "")} ${path}`.trim()
  if (toolName === "ls") return `ls ${path}`.trim()
  if (toolName === "bash") return typeof args.command === "string" ? args.command : "bash"
  return null
}

// 将连续的同名工具调用合并为单行摘要，条目间使用该工具专属分隔符。
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

// 各内置工具类型对应的标题图标。
const TOOL_ICONS: Record<string, LucideIcon> = {
  read: FileText,
  ls: FolderOpen,
  grep: SearchCode,
  find: FolderSearch,
  bash: Terminal,
  edit: Pencil,
  write: PenLine,
  time: Clock,
}

// 未映射工具使用的兜底图标。
const DEFAULT_TOOL_ICON: LucideIcon = Wrench

// 获取工具对应的标题图标。
const getToolIcon = (toolName: string): LucideIcon => TOOL_ICONS[toolName] ?? DEFAULT_TOOL_ICON

// 渲染 diff 内容行：省略占位、行号、语法高亮（与 markdown 代码块一致）。
const renderDiffLines = (diff: AgentDiff, highlightedLines: string[]): React.JSX.Element[] =>
  diff.lines.map((line, index) => {
    // 省略占位行（长上下文段，无行号）。
    if (line.type === "context" && line.newLine === undefined && line.oldLine === undefined) {
      return (
        <div key={index} className="select-none px-3 py-px text-[11px] leading-[1.8] text-white/25">
          …
        </div>
      )
    }
    return (
      <div
        key={index}
        className={`flex min-w-0 items-start px-1 font-mono text-[12px] leading-[1.7] ${ROW_BACKGROUND[line.type]}`}
      >
        <span className="w-9 shrink-0 select-none pr-2 text-right text-white/30">
          {getLineNumber(line)}
        </span>
        <span className={`w-3 shrink-0 select-none ${SIGN_COLORS[line.type]}`}>
          {getSign(line)}
        </span>
        <span
          className="min-w-0 whitespace-pre-wrap break-all"
          dangerouslySetInnerHTML={{ __html: highlightedLines[index] }}
        />
      </div>
    )
  })

/**
 * 渲染 Agent 工具调用与结果的时间线步骤。
 * 写/编辑工具携带 diff 时，摘要行升级为折叠开关，点击展开/收起变更代码块（动画与 markdown 代码块一致）。
 */
export const AgentToolCallBlock = ({
  toolCall,
  toolCalls,
  toolResult,
  diff,
  defaultExpanded = false,
}: AgentToolCallBlockProps): React.JSX.Element | null => {
  // diff 折叠状态与展开态内容高度（仅写/编辑工具使用）。
  const [isDiffExpanded, setIsDiffExpanded] = useState(defaultExpanded)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const diffInnerRef = useRef<HTMLDivElement>(null)

  const resolvedToolCalls = toolCalls?.length ? toolCalls : toolCall ? [toolCall] : []
  const firstToolCall = resolvedToolCalls[0]
  const toolName = firstToolCall?.toolName ?? toolResult?.toolName ?? "tool"
  const resolvedDiff = diff ?? toolResult?.diff

  // 按文件后缀推断语言并逐行生成语法高亮 HTML。
  const diffLanguage = useMemo(
    () => languageFromFileName(resolvedDiff?.fileName ?? ""),
    [resolvedDiff?.fileName],
  )
  const highlightedDiffLines = useMemo(
    () =>
      resolvedDiff ? resolvedDiff.lines.map((line) => highlightCode(line.text, diffLanguage)) : [],
    [resolvedDiff, diffLanguage],
  )

  // 展开态测量内容高度（受最大高度约束），diff 更新时保持折叠动画精确。
  useLayoutEffect(() => {
    const element = diffInnerRef.current
    if (!element || !isDiffExpanded) {
      setContentHeight(null)
      return undefined
    }
    const updateHeight = (): void =>
      setContentHeight(Math.min(element.scrollHeight, MAX_CONTENT_HEIGHT))
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [resolvedDiff, isDiffExpanded])

  if (!toolCall && !toolCalls?.length && !toolResult) return null

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
  // 仅写/编辑工具携带含变更的 diff 时，摘要行才升级为折叠开关。
  const hasDiffToggle =
    commandSummary !== null &&
    resolvedDiff !== undefined &&
    resolvedDiff.lines.some((line) => line.type !== "context")
  const ToolIcon = getToolIcon(toolName)

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <ToolIcon className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        <span className="font-mono text-[12px] font-bold text-amber-300">{displayToolName}</span>
      </div>
      {hasDiffToggle && resolvedDiff ? (
        <>
          <button
            type="button"
            aria-label="Diff 内容"
            aria-expanded={isDiffExpanded}
            className="mt-1 flex h-5 w-fit max-w-full min-w-0 items-center gap-1 rounded-[6px] bg-[#212121] pl-1 pr-2 text-[12px] text-white/50 transition-all duration-200 hover:bg-[#212121]/80 hover:text-white/70 focus:outline-none"
            onClick={() => setIsDiffExpanded((previous) => !previous)}
          >
            <CornerDownRight className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">{commandSummary}</span>
            <span className="shrink-0 text-[11px]">
              <span className="text-emerald-400">+{resolvedDiff.stats.added}</span>
              <span className="ml-2 text-red-400">−{resolvedDiff.stats.removed}</span>
              {resolvedDiff.truncated && (
                <span className="ml-2 text-white/25">已截断，仅显示部分变更</span>
              )}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-200 ${isDiffExpanded ? "" : "-rotate-90"}`}
            />
          </button>
          <div
            className="overflow-hidden transition-[max-height] duration-300 ease-in-out"
            style={{ maxHeight: isDiffExpanded ? `${contentHeight ?? 0}px` : "0px" }}
          >
            <div
              ref={diffInnerRef}
              className="agent-diff-block custom-scrollbar max-h-[320px] overflow-y-auto rounded-[6px] bg-[#2a2a2a] py-1"
            >
              {renderDiffLines(resolvedDiff, highlightedDiffLines)}
            </div>
          </div>
        </>
      ) : isSimpleTool ? (
        <div className="mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
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
      ) : (
        <div className="mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
          <span className="min-w-0 break-all">{summary}</span>
        </div>
      )}
    </div>
  )
}
