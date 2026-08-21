import type { PromptAssembly } from "@shared/contracts/agent"
import {
  AlertCircle,
  BarChart3,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Compass,
  Copy,
  FileCode,
  FileText,
  Layers,
  Loader2,
  Minimize2,
  RefreshCw,
  Sliders,
  Terminal,
  User,
  Workflow,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import type React from "react"
import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import { buildExecutionSteps } from "@/features/agent/executionFlow"
import type { ChatMessage, ExecutionStep, ExecutionStepKind } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"

export interface AgentExecutionFlowPanelProps {
  // 是否打开面板
  isOpen: boolean
  // 关闭面板回调
  onClose: () => void
  // 当前会话的全部消息列表
  messages: readonly ChatMessage[]
  // 当前会话 ID（用于查询完整装配的系统提示词）
  sessionId?: string
  // 当前项目或工作区路径
  cwd?: string
  // 面板滚动容器 Ref
  scrollRef?: React.RefObject<HTMLDivElement | null>
}

type FilterKind = "all" | ExecutionStepKind

/**
 * 复制文本辅助函数
 */
const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 格式化 JSON 字符串
 */
const formatJsonString = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * 获取步骤图标与样式配置
 */
const getKindMeta = (
  kind: ExecutionStepKind,
): {
  icon: React.ComponentType<{ className?: string }>
  labelKey: TranslationKey
  tagColor: "indigo" | "amber" | "purple" | "sky" | "blue" | "emerald" | "default"
} => {
  switch (kind) {
    case "system":
      return { icon: Compass, labelKey: "agent.kindSystem", tagColor: "indigo" }
    case "user":
      return { icon: User, labelKey: "agent.kindUser", tagColor: "amber" }
    case "thinking":
      return { icon: Brain, labelKey: "agent.kindThinking", tagColor: "purple" }
    case "tool":
      return { icon: Wrench, labelKey: "agent.kindTool", tagColor: "sky" }
    case "subagent":
      return { icon: Bot, labelKey: "agent.kindSubagent", tagColor: "blue" }
    case "compaction":
      return { icon: Minimize2, labelKey: "agent.kindCompaction", tagColor: "indigo" }
    case "assistant":
      return { icon: FileText, labelKey: "agent.kindAssistant", tagColor: "emerald" }
    default:
      return { icon: Workflow, labelKey: "agent.executionFlow", tagColor: "default" }
  }
}

/**
 * 单个步骤展示条目组件
 */
const StepItem = ({ step }: { step: ExecutionStep }): React.JSX.Element => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isCopied, setIsCopied] = useState(false)

  const meta = getKindMeta(step.kind)
  const IconComponent = meta.icon

  const handleCopy = useCallback(async (e: React.MouseEvent, contentToCopy: string) => {
    e.stopPropagation()
    const success = await copyToClipboard(contentToCopy)
    if (success) {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 1500)
    }
  }, [])

  const copyPayload = useMemo(() => {
    if (step.systemContent) return step.systemContent.rendered
    if (step.userContent) return step.userContent.text
    if (step.thinkingContent) return step.thinkingContent.text
    if (step.toolContent) {
      return `Tool: ${step.toolContent.toolName}\nArgs:\n${formatJsonString(
        step.toolContent.args,
      )}\nResult:\n${step.toolContent.result ?? ""}`
    }
    if (step.subagentContent) {
      return `Subagent: ${step.subagentContent.name}\n${formatJsonString(
        step.subagentContent.subagent,
      )}`
    }
    if (step.assistantContent) return step.assistantContent.text
    return step.title
  }, [step])

  return (
    <div className="agent-execution-flow-step rounded-[6px] border border-white/5 bg-[#212121] transition-colors hover:border-white/10">
      {/* 头部摘要栏 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded((prev) => !prev)
          }
        }}
        className="agent-execution-flow-step-header flex cursor-pointer items-center justify-between gap-2 px-2.5 py-2 select-none"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {/* 折叠箭头 */}
          <div className="text-white/40">
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>

          {/* 步骤全局索引 */}
          <span className="shrink-0 font-mono text-[11px] font-medium text-white/35">
            #{step.stepIndex}
          </span>

          {/* 类型标签 */}
          <LxTag
            size="small"
            color={meta.tagColor}
            prefix={<IconComponent className="h-3 w-3" />}
            className="shrink-0"
          >
            {t(meta.labelKey)}
          </LxTag>

          {/* 步骤标题与副标题 */}
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <span className="truncate font-mono text-[12px] font-medium text-white/85">
              {step.title}
            </span>
            {step.subtitle && (
              <span className="hidden truncate text-[11px] text-white/40 sm:inline">
                {step.subtitle}
              </span>
            )}
          </div>
        </div>

        {/* 右侧状态与指标 */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* 状态图标 */}
          {step.status === "running" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
          )}
          {step.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-400" />}
          {step.status === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />}

          {/* 快捷复制 */}
          <LxIconButton
            size="small"
            aria-label={t("agent.copyContent")}
            title={{
              content: isCopied ? t("common.copied") : t("agent.copyContent"),
              placement: "left",
            }}
            onClick={(e) => void handleCopy(e, copyPayload)}
          >
            {isCopied ? (
              <Check className="h-3 w-3 text-emerald-400" />
            ) : (
              <Copy className="h-3 w-3 text-white/40" />
            )}
          </LxIconButton>
        </div>
      </div>

      {/* 展开详情区 */}
      {isExpanded && (
        <div className="agent-execution-flow-step-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-[12px]">
          {/* 系统提示词与注入详情 */}
          {step.systemContent && (
            <div className="flex flex-col gap-3 font-mono text-[11px]">
              {/* 分段概览 */}
              {step.systemContent.sections.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-indigo-300 font-semibold">
                    <Layers className="h-3 w-3" />
                    <span>{t("agent.systemPrompt")}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {step.systemContent.sections.map((sec) => (
                      <details
                        key={sec.name}
                        className="group rounded border border-white/5 bg-white/[0.02] p-2"
                      >
                        <summary className="cursor-pointer font-semibold text-white/80 select-none">
                          {sec.name}
                        </summary>
                        <div className="custom-scrollbar mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-white/70">
                          {sec.text}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {/* 运行时上下文注入 */}
              {step.systemContent.contexts.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-sky-300 font-semibold">
                    <Sliders className="h-3 w-3" />
                    <span>{t("agent.runtimeContext")}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {step.systemContent.contexts.map((ctx) => (
                      <div
                        key={ctx.name}
                        className="rounded border border-white/5 bg-black/30 p-2 text-white/70"
                      >
                        <div className="font-semibold text-white/80">{ctx.name}</div>
                        <div className="mt-1 whitespace-pre-wrap">{ctx.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 激活的工具全集 */}
              {step.systemContent.activeTools && step.systemContent.activeTools.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1 text-amber-300 font-semibold">
                    <Wrench className="h-3 w-3" />
                    <span>{t("agent.activeToolsList")}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {step.systemContent.activeTools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/60"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 用户输入详情 */}
          {step.userContent && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {step.userContent.command && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-mono text-amber-300">
                    <Zap className="h-3 w-3" />
                    {t("agent.commandTrigger")}: /{step.userContent.command.name}
                  </span>
                )}
                {step.userContent.isSteer && (
                  <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-mono text-sky-300">
                    {t("agent.steerMessage")}
                  </span>
                )}
              </div>
              <div className="whitespace-pre-wrap font-sans text-white/90">
                {step.userContent.text || (
                  <span className="text-white/30">{t("agent.emptyPrompt")}</span>
                )}
              </div>
              {step.userContent.files && step.userContent.files.length > 0 && (
                <div className="flex flex-col gap-1 pt-1">
                  <div className="text-[11px] font-mono text-white/40">
                    {t("agent.attachedFiles")}:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {step.userContent.files.map((file) => (
                      <span
                        key={file.path}
                        className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/60"
                      >
                        <FileCode className="h-3 w-3" />
                        {file.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 思考过程详情 */}
          {step.thinkingContent && (
            <div className="custom-scrollbar max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-purple-500/20 bg-purple-950/20 p-2 font-mono text-[11px] leading-relaxed text-purple-200/90">
              {step.thinkingContent.text}
            </div>
          )}

          {/* 工具调用详情 */}
          {step.toolContent && (
            <div className="flex flex-col gap-2">
              {/* 参数 */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                  <span className="flex items-center gap-1 font-mono">
                    <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
                  </span>
                  {step.toolContent.toolCallId && (
                    <span className="font-mono text-[10px] text-white/30">
                      ID: {step.toolContent.toolCallId}
                    </span>
                  )}
                </div>
                <div className="custom-scrollbar max-h-48 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px] text-sky-200/90">
                  {formatJsonString(step.toolContent.args)}
                </div>
              </div>

              {/* 结构化 Diff (针对 write/edit 工具) */}
              {step.toolContent.diff && (
                <div>
                  <div className="mb-1 flex items-center justify-between font-mono text-[11px] text-white/45">
                    <span className="flex items-center gap-1">
                      <Code2 className="h-3 w-3" /> {t("agent.lineDiff")}
                    </span>
                    {step.toolContent.diff.stats && (
                      <span className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-emerald-400">
                          +{step.toolContent.diff.stats.added}
                        </span>
                        <span className="text-red-400">-{step.toolContent.diff.stats.removed}</span>
                      </span>
                    )}
                  </div>
                  <div className="custom-scrollbar max-h-48 overflow-y-auto rounded bg-black/40 p-2 font-mono text-[11px]">
                    {step.toolContent.diff.fileName && (
                      <div className="text-white/60 mb-1">{step.toolContent.diff.fileName}</div>
                    )}
                    {step.toolContent.diff.lines && step.toolContent.diff.lines.length > 0 && (
                      <div className="flex flex-col">
                        {step.toolContent.diff.lines.map((line, lIdx) => (
                          <div
                            key={lIdx}
                            className={`flex items-start gap-2 px-1 ${
                              line.type === "add"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : line.type === "del"
                                  ? "bg-red-500/15 text-red-300"
                                  : "text-white/60"
                            }`}
                          >
                            <span className="w-4 shrink-0 select-none text-right text-[10px] opacity-40">
                              {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                            </span>
                            <span className="whitespace-pre-wrap">{line.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 结果 */}
              {step.toolContent.result !== undefined && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-[11px] text-white/45">
                    <span className="flex items-center gap-1 font-mono">
                      <FileText className="h-3 w-3" /> {t("agent.toolResult")}
                    </span>
                    {step.toolContent.isError && (
                      <span className="text-[10px] text-red-400 font-medium">ERROR</span>
                    )}
                  </div>
                  <div
                    className={`custom-scrollbar max-h-60 overflow-y-auto rounded p-2 font-mono text-[11px] leading-relaxed ${
                      step.toolContent.isError
                        ? "border border-red-500/20 bg-red-950/20 text-red-200"
                        : "bg-black/40 text-white/80"
                    }`}
                  >
                    {step.toolContent.result || <span className="text-white/30">-</span>}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 子代理详情 */}
          {step.subagentContent && (
            <div className="flex flex-col gap-2 font-mono text-[11px]">
              <div className="flex items-center gap-2 text-white/70">
                <span className="text-white/40">Task:</span>
                <span className="font-bold text-blue-300">{step.subagentContent.name}</span>
              </div>
              {step.subagentContent.subagent?.prompt && (
                <div className="rounded bg-black/30 p-2 text-white/80">
                  <div className="text-[10px] text-white/40 mb-0.5">Prompt:</div>
                  <div className="whitespace-pre-wrap">{step.subagentContent.subagent.prompt}</div>
                </div>
              )}
              {step.subagentContent.subagent?.description && (
                <div className="text-white/50">{step.subagentContent.subagent.description}</div>
              )}
              {step.subagentContent.subagent?.usage && (
                <div className="flex gap-3 text-white/40 pt-1">
                  <span>Input: {step.subagentContent.subagent.usage.input}</span>
                  <span>Output: {step.subagentContent.subagent.usage.output}</span>
                  <span>Total: {step.subagentContent.subagent.usage.totalTokens}</span>
                </div>
              )}
            </div>
          )}

          {/* 上下文压缩详情 */}
          {step.compactionContent && (
            <div className="flex flex-col gap-1.5 font-mono text-[11px] text-white/70">
              <div className="flex items-center gap-2">
                <span className="text-white/40">Mode:</span>
                <span className="text-indigo-300 font-semibold">
                  {step.compactionContent.isManual ? "Manual (/compact)" : "Automatic"}
                </span>
              </div>
              {step.compactionContent.summaryTokens && (
                <div className="flex items-center gap-2">
                  <span className="text-white/40">Summary:</span>
                  <span className="text-indigo-300">
                    {step.compactionContent.summaryTokens} tokens
                  </span>
                </div>
              )}
              {step.compactionContent.compactionUsage && (
                <div className="flex gap-3 text-white/40">
                  <span>Input: {step.compactionContent.compactionUsage.input}</span>
                  <span>Output: {step.compactionContent.compactionUsage.output}</span>
                </div>
              )}
            </div>
          )}

          {/* 助手回复详情 */}
          {step.assistantContent && (
            <div className="flex flex-col gap-2 font-sans text-white/90">
              <div className="whitespace-pre-wrap leading-relaxed">
                {step.assistantContent.text}
              </div>
              {(step.assistantContent.model || step.assistantContent.usage) && (
                <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-1.5 font-mono text-[11px] text-white/40">
                  {step.assistantContent.model && <span>{step.assistantContent.model}</span>}
                  {step.assistantContent.stopReason && (
                    <span>
                      {t("agent.stopReason")}: {step.assistantContent.stopReason}
                    </span>
                  )}
                  {step.assistantContent.usage && (
                    <span>
                      {step.assistantContent.usage.input} in / {step.assistantContent.usage.output}{" "}
                      out
                    </span>
                  )}
                  {step.assistantContent.usage?.cacheRead ? (
                    <span className="text-sky-300/80">
                      {t("agent.cacheReadTokens", {
                        count: step.assistantContent.usage.cacheRead,
                      })}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * AgentExecutionFlowPanel - 从顶部向下展开、恰好覆盖消息列表的执行流程面板。
 * 只读展示当前 Agent 的全部执行日志、提示词注入与步骤。
 */
export const AgentExecutionFlowPanel = ({
  isOpen,
  onClose,
  messages,
  sessionId,
  cwd,
  scrollRef,
}: AgentExecutionFlowPanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  // 快照机制：打开瞬间捕获快照，内部保持静态，支持手动刷新
  const [snapshotMessages, setSnapshotMessages] = useState<readonly ChatMessage[]>([])
  const [promptAssembly, setPromptAssembly] = useState<PromptAssembly | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKind>("all")

  // 获取完整系统提示词装配
  const fetchPromptAssembly = useCallback(async () => {
    try {
      const assembly = await agentApi.getPromptAssembly(sessionId, cwd)
      setPromptAssembly(assembly)
    } catch {
      setPromptAssembly(null)
    }
  }, [sessionId, cwd])

  // 打开时捕获快照并获取系统提示词装配
  useEffect(() => {
    if (isOpen) {
      setSnapshotMessages(messages)
      void fetchPromptAssembly()
    }
  }, [isOpen, messages, fetchPromptAssembly])

  // 手动刷新快照
  const handleRefresh = useCallback(() => {
    setSnapshotMessages(messages)
    void fetchPromptAssembly()
  }, [messages, fetchPromptAssembly])

  // 提取步骤列表
  const steps = useMemo(
    () => buildExecutionSteps(snapshotMessages, promptAssembly),
    [snapshotMessages, promptAssembly],
  )

  // 过滤后的步骤列表
  const filteredSteps = useMemo(() => {
    if (activeFilter === "all") return steps
    return steps.filter((step) => step.kind === activeFilter)
  }, [steps, activeFilter])

  // 统计指标汇总
  const stats = useMemo(() => {
    let inputTokens = 0
    let outputTokens = 0
    let cacheReadTokens = 0
    let totalTokens = 0
    let toolCallsCount = 0
    let turnsCount = 0

    for (const step of steps) {
      if (step.turnIndex > turnsCount) {
        turnsCount = step.turnIndex
      }
      if (step.kind === "tool" || step.kind === "subagent") {
        toolCallsCount++
      }
      if (step.tokens) {
        if (step.tokens.input) inputTokens += step.tokens.input
        if (step.tokens.output) outputTokens += step.tokens.output
        if (step.tokens.cacheRead) cacheReadTokens += step.tokens.cacheRead
        if (step.tokens.total) totalTokens += step.tokens.total
      }
    }

    return {
      turnsCount,
      totalSteps: steps.length,
      toolCallsCount,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      totalTokens,
    }
  }, [steps])

  // 各类型步骤计数
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKind, number> = {
      all: steps.length,
      system: 0,
      user: 0,
      thinking: 0,
      tool: 0,
      subagent: 0,
      compaction: 0,
      assistant: 0,
    }
    for (const step of steps) {
      counts[step.kind]++
    }
    return counts
  }, [steps])

  return (
    <div
      role="dialog"
      aria-label={t("agent.executionFlow")}
      inert={!isOpen}
      className="agent-execution-flow-panel absolute inset-0 z-20 flex flex-col bg-[#262626] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        transform: isOpen ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.28s cubic-bezier(0.2, 0.85, 0.2, 1)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* 面板头部 */}
      <div className="agent-execution-flow-header flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Workflow className="h-4 w-4 text-sky-400" />
          <span className="font-mono text-[13px] font-bold text-white/90">
            {t("agent.executionFlow")}
          </span>
          <span className="rounded bg-white/5 px-1.5 py-0.2 font-mono text-[11px] text-white/40">
            {stats.totalSteps}
          </span>
        </div>

        {/* 顶部右侧操作栏 */}
        <div className="flex shrink-0 items-center gap-1">
          {/* 统计指标浮层 */}
          <LxTooltip
            multiline
            placement="bottom"
            content={
              <div className="flex flex-col gap-1 whitespace-nowrap text-[12px]">
                <div className="font-bold text-white/90">
                  {t("agent.turnCount", { count: stats.turnsCount })} · {stats.totalSteps}
                </div>
                <div className="text-white/60">
                  {t("agent.toolCallsCount", { count: stats.toolCallsCount })}
                </div>
                <div className="my-0.5 h-[1px] bg-white/10" />
                {stats.inputTokens > 0 && (
                  <span>{t("agent.inputTokens", { count: stats.inputTokens })}</span>
                )}
                {stats.outputTokens > 0 && (
                  <span>{t("agent.outputTokens", { count: stats.outputTokens })}</span>
                )}
                {stats.cacheReadTokens > 0 && (
                  <span className="text-sky-300">
                    {t("agent.cacheReadTokens", { count: stats.cacheReadTokens })}
                  </span>
                )}
                {stats.totalTokens > 0 && (
                  <span>{t("agent.totalTokens", { count: stats.totalTokens })}</span>
                )}
              </div>
            }
          >
            <LxIconButton size="small" aria-label={t("agent.viewStats")}>
              <BarChart3 className="h-3.5 w-3.5" />
            </LxIconButton>
          </LxTooltip>

          {/* 刷新按钮 */}
          <LxIconButton
            size="small"
            aria-label={t("agent.refreshFlow")}
            title={{ content: t("agent.refreshFlow"), placement: "bottom" }}
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </LxIconButton>

          {/* 关闭按钮 */}
          <LxIconButton
            size="small"
            aria-label={t("agent.closeExecutionFlow")}
            title={{ content: t("agent.collapsePanel"), placement: "bottom" }}
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      </div>

      {/* 筛选标签条 */}
      {steps.length > 0 && (
        <div className="agent-execution-flow-filter-bar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/5 bg-black/10 px-3 py-1.5 custom-scrollbar select-none">
          <button
            type="button"
            onClick={() => setActiveFilter("all")}
            className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
              activeFilter === "all"
                ? "agent-execution-flow-filter-btn-active bg-white/15 text-white"
                : "text-white/40 hover:bg-white/5 hover:text-white/70"
            }`}
          >
            {t("agent.filterAll")} ({filterCounts.all})
          </button>
          {filterCounts.system > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("system")}
              className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "system"
                  ? "agent-execution-flow-filter-btn-active bg-indigo-500/20 text-indigo-300"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterSystem")} ({filterCounts.system})
            </button>
          )}
          {filterCounts.tool > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("tool")}
              className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "tool"
                  ? "agent-execution-flow-filter-btn-active bg-sky-500/20 text-sky-300"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterTools")} ({filterCounts.tool})
            </button>
          )}
          {filterCounts.thinking > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("thinking")}
              className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "thinking"
                  ? "agent-execution-flow-filter-btn-active bg-purple-500/20 text-purple-300"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterThinking")} ({filterCounts.thinking})
            </button>
          )}
          {filterCounts.subagent > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("subagent")}
              className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "subagent"
                  ? "agent-execution-flow-filter-btn-active bg-blue-500/20 text-blue-300"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterSubagent")} ({filterCounts.subagent})
            </button>
          )}
          {filterCounts.user > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("user")}
              className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "user"
                  ? "agent-execution-flow-filter-btn-active bg-amber-500/20 text-amber-300"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterUser")} ({filterCounts.user})
            </button>
          )}
          {filterCounts.assistant > 0 && (
            <button
              type="button"
              onClick={() => setActiveFilter("assistant")}
              className={`agent-execution-flow-filter-btn cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "assistant"
                  ? "agent-execution-flow-filter-btn-active bg-emerald-500/20 text-emerald-300"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterAssistant")} ({filterCounts.assistant})
            </button>
          )}
        </div>
      )}

      {/* 步骤列表内容区 */}
      {steps.length > 0 ? (
        <div
          ref={scrollRef}
          className="agent-execution-flow-scroll custom-scrollbar min-h-0 flex-1 overflow-y-scroll [scrollbar-gutter:stable] px-3 py-2"
        >
          {filteredSteps.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {filteredSteps.map((step, idx) => {
                const prevStep = filteredSteps[idx - 1]
                const isNewTurn = !prevStep || prevStep.turnIndex !== step.turnIndex

                return (
                  <Fragment key={step.id}>
                    {/* 轮次分隔线 */}
                    {isNewTurn && step.turnIndex > 0 && (
                      <div className="agent-execution-flow-turn-divider my-1.5 flex items-center gap-2">
                        <div className="h-[1px] flex-1 bg-white/10" />
                        <span className="font-mono text-[10px] font-semibold tracking-wider text-white/35 uppercase">
                          {t("agent.turnLabel", { turn: step.turnIndex })}
                        </span>
                        <div className="h-[1px] flex-1 bg-white/10" />
                      </div>
                    )}
                    <StepItem step={step} />
                  </Fragment>
                )
              })}
            </div>
          ) : (
            <div className="flex min-h-full items-center justify-center text-[12px] text-white/35">
              {t("agent.noMatchingSteps")}
            </div>
          )}
        </div>
      ) : (
        /* 空状态 */
        <div className="agent-execution-flow-empty flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-white/40">
          <Workflow className="h-8 w-8 text-white/20" />
          <div className="text-[13px] font-medium text-white/60">{t("agent.noExecutionFlow")}</div>
          <div className="max-w-[240px] text-[12px] text-white/35">
            {t("agent.noExecutionFlowDesc")}
          </div>
        </div>
      )}
    </div>
  )
}
