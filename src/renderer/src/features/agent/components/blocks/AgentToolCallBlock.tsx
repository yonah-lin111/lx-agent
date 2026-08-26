import type { LucideIcon } from "lucide-react"
import {
  Braces,
  ChevronDown,
  Clock,
  Code2,
  CornerDownRight,
  FileText,
  FolderOpen,
  FolderSearch,
  OctagonX,
  Pencil,
  PenLine,
  SearchCode,
  Terminal,
  Wrench,
} from "lucide-react"
import type React from "react"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { TOOL_GROUP_SEPARATORS } from "@/features/agent/constants"
import type { AgentDiff, AgentDiffLine, ChatBlock, LspToolDetails } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { highlightCode, languageFromFileName } from "@/lib/codeHighlight"
import { AgentLspBlock } from "./AgentLspBlock"

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
  // 合并组对应的全部工具结果数据。
  toolResults?: ToolResultBlock[]
  // 写/编辑工具的结构化 diff（随 toolCall 配套传入，用于折叠展示）。
  diff?: AgentDiff
  // lsp 工具的检索结果（合并组内每个调用一份；流式中尚未返回时缺省）。
  lspDetails?: LspToolDetails[]
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

// bash 命令最多展示行数，超出部分折叠为省略号。
const MAX_BASH_LINES = 4

// 将 bash 命令截断为最多 4 行，超出行折叠为省略号。
const truncateBashCommand = (command: string): string => {
  const lines = command.split("\n")
  if (lines.length <= MAX_BASH_LINES) return command
  return `${lines.slice(0, MAX_BASH_LINES).join("\n")}\n…`
}

// 收缩路径中间段，保留根目录与最后两个路径段。
const compactPath = (path: string): string => {
  const isAbsolute = path.startsWith("/")
  const segments = path.split("/").filter(Boolean)

  if (segments.length <= 3) return path

  return `${isAbsolute ? "/" : ""}${segments[0]}/.../${segments.slice(-2).join("/")}`
}

// 格式化 read 工具的路径与分页范围（例如 foo.ts (L1-100)）。
const formatReadTarget = (args: Record<string, unknown>): string => {
  const path = typeof args.path === "string" ? compactPath(args.path) : "Unknown file"
  const offset = typeof args.offset === "number" ? args.offset : undefined
  const limit = typeof args.limit === "number" ? args.limit : undefined

  if (offset !== undefined || limit !== undefined) {
    const start = offset ?? 1
    const range = limit !== undefined ? `${start}-${start + limit - 1}` : `${start}+`
    return `${path} (L${range})`
  }

  return path
}

// 从工具调用中提取需要展示的文件路径或目标说明。
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
  if (toolName === "read") return `read ${formatReadTarget(args)}`
  if (toolName === "edit" || toolName === "write") return `${toolName} ${path}`
  if (toolName === "find") return `find ${String(args.pattern ?? "")} ${path}`.trim()
  if (toolName === "grep") return `grep ${String(args.pattern ?? "")} ${path}`.trim()
  if (toolName === "ls") return `ls ${path}`.trim()
  if (toolName === "job_output") return `job_output ${String(args.job_id ?? "")}`
  if (toolName === "job_list") return "job_list"
  if (toolName === "job_kill") return `job_kill ${String(args.job_id ?? "")}`
  if (toolName === "bash") {
    const command = typeof args.command === "string" ? args.command : "bash"
    const bg = args.background ? " (bg)" : ""
    return `${truncateBashCommand(command)}${bg}`
  }
  return null
}

// 将连续的同名工具调用合并为单行摘要，条目间使用该工具专属分隔符。
const formatToolGroupSummary = (toolName: string, toolCalls: ToolCallBlock[]): string => {
  const separator = TOOL_GROUP_SEPARATORS[toolName]
  if (!separator || toolCalls.length <= 1) return ""

  if (toolName === "read") {
    return toolCalls.map(({ args }) => formatReadTarget(args)).join(separator)
  }

  const entries = toolCalls.map(({ args }) => {
    const path = typeof args.path === "string" ? compactPath(args.path) : null
    if (toolName === "ls") return path ?? "Unknown file"
    if (toolName === "find" || toolName === "grep") {
      return `${String(args.pattern ?? "")} ${path ?? "."}`.trim()
    }
    if (toolName === "bash") {
      const command = typeof args.command === "string" ? args.command : "bash"
      const bg = args.background ? " (bg)" : ""
      return `${truncateBashCommand(command)}${bg}`
    }
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
  apply_patch: Code2,
  time: Clock,
  lsp: Braces,
  job_output: Terminal,
  job_list: Terminal,
  job_kill: OctagonX,
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
// 提取工具结果中包含的溢出文件路径。
const extractSpillFilePathFromResults = (
  results: (ToolResultBlock | undefined)[],
): string | null => {
  for (const res of results) {
    if (!res?.text) continue
    const match = res.text.match(/Full output saved to:\s*([^\s\]]+)/)
    if (match) {
      // 去除结尾可能粘连的英文句号或标点
      return match[1].replace(/[.,;:!]+$/, "")
    }
  }
  return null
}

export const AgentToolCallBlock = ({
  toolCall,
  toolCalls,
  toolResult,
  toolResults,
  diff,
  lspDetails,
  defaultExpanded = false,
}: AgentToolCallBlockProps): React.JSX.Element | null => {
  const { t } = useTranslation()
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

  // lsp 专用结果块：可点击位置行 / hover 文本 / 无结果摘要（对齐 read 的专用分支）。
  if (toolName === "lsp") {
    return <AgentLspBlock toolCalls={resolvedToolCalls} details={lspDetails} />
  }

  const displayToolName = toolName.charAt(0).toUpperCase() + toolName.slice(1)
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

  const allResults = toolResults && toolResults.length > 0 ? toolResults : [toolResult]
  const spillFilePath = extractSpillFilePathFromResults(allResults)

  return (
    <div className="agent-tool-call-block my-0.5 min-w-0">
      <div className="agent-tool-call-header flex items-center gap-1">
        <ToolIcon className="h-3.5 w-3.5 shrink-0 text-amber-300" />
        <span className="agent-tool-call-name font-mono text-[12px] font-bold text-amber-300">
          {displayToolName}
        </span>
      </div>
      {hasDiffToggle && resolvedDiff ? (
        <>
          <button
            type="button"
            aria-label={t("agent.diffContent")}
            aria-expanded={isDiffExpanded}
            className="agent-tool-diff-toggle mt-1 flex h-5 w-fit max-w-full min-w-0 items-center gap-1 pl-1 pr-2 text-[12px] text-white/50 transition-all duration-200 hover:text-white/70 focus:outline-none"
            onClick={() => setIsDiffExpanded((previous) => !previous)}
          >
            <CornerDownRight className="agent-tool-corner h-3 w-3 shrink-0" />
            <span className="agent-tool-diff-title min-w-0 flex-1 truncate text-left">
              {commandSummary}
            </span>
            <span className="shrink-0 text-[11px]">
              <span className="agent-tool-diff-added text-emerald-400">
                +{resolvedDiff.stats.added}
              </span>
              <span className="agent-tool-diff-removed ml-2 text-red-400">
                −{resolvedDiff.stats.removed}
              </span>
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
              className="agent-diff-block custom-scrollbar max-h-[320px] overflow-y-auto rounded-[6px] py-1"
            >
              {renderDiffLines(resolvedDiff, highlightedDiffLines)}
            </div>
          </div>
        </>
      ) : isSimpleTool ? (
        <div className="agent-tool-call-summary mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="agent-tool-corner mt-[2px] h-3 w-3 shrink-0" />
          {groupSummary ? (
            <span className="agent-tool-call-desc min-w-0 break-all">{groupSummary}</span>
          ) : (
            <span className="agent-tool-call-desc min-w-0 break-all">{summary}</span>
          )}
        </div>
      ) : (
        <div className="agent-tool-call-summary mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
          <CornerDownRight className="agent-tool-corner mt-[2px] h-3 w-3 shrink-0" />
          <span className="agent-tool-call-desc min-w-0 break-all">{summary}</span>
        </div>
      )}
      {spillFilePath && (
        <div className="mt-1 flex min-w-0 items-center gap-1 pl-1 text-[12px] text-white/45">
          <CornerDownRight className="agent-tool-corner mt-[2px] h-3 w-3 shrink-0" />
          <span>Output truncated.</span>
          <span
            className="cursor-pointer text-[12px] text-white/60 underline underline-offset-2 transition-colors hover:text-white/90 focus:outline-none"
            onClick={() => {
              if (window.api?.agent?.showItemInFolder) {
                void window.api.agent.showItemInFolder(spillFilePath)
              } else {
                void agentApi.openFileAt(spillFilePath, 1)
              }
            }}
          >
            Open full output file
          </span>
        </div>
      )}
      {firstToolCall?.progress && (
        <div className="agent-tool-call-progress mt-1 max-h-24 overflow-y-auto rounded-[4px] border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] leading-relaxed text-white/50 whitespace-pre-wrap break-all">
          {firstToolCall.progress}
        </div>
      )}
    </div>
  )
}
