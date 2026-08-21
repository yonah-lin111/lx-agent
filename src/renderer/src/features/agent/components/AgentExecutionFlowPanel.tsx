import type { PromptAssembly } from "@shared/contracts/agent"
import {
  AlertCircle,
  BarChart3,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  Code2,
  Compass,
  Copy,
  FileCode,
  FileText,
  Layers,
  Loader2,
  Minimize2,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Terminal,
  User,
  Workflow,
  Wrench,
  X,
  Zap,
} from "lucide-react"
import type React from "react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import {
  CATEGORY_ORDER,
  EXECUTION_CATEGORIES,
  type ExecutionCategoryKey,
  getToolExecutionCategory,
} from "@/features/agent/components/AgentExecutionGroup"
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

// 将工具列表按分类分组
const groupToolsByCategory = (
  tools: string[],
): { category: ExecutionCategoryKey; tools: string[] }[] => {
  const map = new Map<ExecutionCategoryKey, string[]>()
  for (const tool of tools) {
    const cat = getToolExecutionCategory(tool)
    const list = map.get(cat)
    if (list) {
      list.push(tool)
    } else {
      map.set(cat, [tool])
    }
  }
  return CATEGORY_ORDER.filter((cat) => (map.get(cat)?.length ?? 0) > 0).map((cat) => ({
    category: cat,
    tools: map.get(cat)!,
  }))
}
const getToolCategoryMeta = (
  toolName: string,
): {
  icon: React.ComponentType<{ className?: string }>
  label: string
  tagColor: "teal" | "purple" | "emerald" | "sky" | "blue" | "default"
  textColor: string
} => {
  if (toolName === "edit" || toolName === "write") {
    return { icon: Code2, label: "Coding", tagColor: "emerald", textColor: "text-emerald-300" }
  }
  if (toolName === "task") {
    return { icon: Bot, label: "Subagent", tagColor: "blue", textColor: "text-blue-300" }
  }
  if (toolName === "read_skill") {
    return { icon: Sparkles, label: "Skill", tagColor: "purple", textColor: "text-violet-300" }
  }
  if (toolName === "web_search" || toolName === "webfetch") {
    return { icon: Search, label: "Web", tagColor: "emerald", textColor: "text-emerald-300" }
  }
  if (toolName.includes("_")) {
    return { icon: Terminal, label: "MCP", tagColor: "teal", textColor: "text-cyan-300" }
  }
  return { icon: Wrench, label: "Tool", tagColor: "sky", textColor: "text-sky-300" }
}

/**
 * 获取步骤图标与样式配置
 */
const getKindMeta = (
  step: ExecutionStep,
): {
  icon?: React.ComponentType<{ className?: string }>
  labelKey?: TranslationKey
  customLabel?: string
  tagColor: "indigo" | "amber" | "purple" | "sky" | "blue" | "emerald" | "teal" | "default"
  textColor?: string
} => {
  switch (step.kind) {
    case "system":
      return { icon: Compass, labelKey: "agent.kindSystem", tagColor: "indigo" }
    case "user":
      return { icon: User, labelKey: "agent.kindUser", tagColor: "amber" }
    case "thinking":
      return { icon: Brain, labelKey: "agent.kindThinking", tagColor: "purple" }
    case "tool": {
      return {
        customLabel: "tool_schema",
        tagColor: "sky",
        textColor: "text-sky-300",
      }
    }
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
  const [isExpanded, setIsExpanded] = useState(
    step.kind === "user" || step.kind === "assistant",
  )
  const [isCopied, setIsCopied] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const meta = getKindMeta(step)
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
            prefix={
              IconComponent ? (
                <IconComponent
                  className={`h-3 w-3 ${meta.customLabel && meta.textColor ? meta.textColor : ""}`}
                />
              ) : undefined
            }
            className="shrink-0"
          >
            {meta.customLabel || (meta.labelKey ? t(meta.labelKey) : "")}
          </LxTag>

          {/* 步骤标题与副标题 */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span
              className={`font-mono text-[12px] font-medium text-white/85 ${
                step.kind === "tool" ? "shrink-0 whitespace-nowrap" : "truncate"
              }`}
            >
              {step.status === "running" && (step.kind === "assistant" || step.kind === "thinking")
                ? "..."
                : step.title}
            </span>
            {step.subtitle && step.status !== "running" && (
              <span className="hidden min-w-0 truncate text-[11px] text-white/40 sm:inline">
                {step.subtitle}
              </span>
            )}
          </div>
        </div>

        {/* 右侧状态与指标 */}
        <div className="flex shrink-0 items-center gap-1.5">
          {/* 状态图标按钮 */}
          {step.status === "running" && (
            <LxIconButton
              size="small"
              aria-label="Running"
              title={{ content: "Running", placement: "left" }}
              className="text-sky-400"
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
            </LxIconButton>
          )}
          {step.status === "error" && (
            <LxIconButton
              size="small"
              aria-label="Error"
              title={{ content: "Error", placement: "left" }}
              className="text-red-400"
            >
              <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            </LxIconButton>
          )}
          {step.status === "done" && (
            <LxIconButton
              size="small"
              aria-label="Done"
              title={{ content: "Done", placement: "left" }}
              className="text-emerald-400/80"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
            </LxIconButton>
          )}

          {/* 快捷复制 */}
          {step.status !== "running" && (
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
          )}
        </div>
      </div>

      {/* 展开详情区 */}
      {isExpanded && step.status !== "running" && (
        <div className="agent-execution-flow-step-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-[12px]">
          {/* 系统提示词与注入详情 */}
          {step.systemContent && (
            <div className="agent-execution-flow-system-content flex flex-col gap-3 font-mono text-[11px]">
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

              {/* 激活的工具全集（按分类展示） */}
              {step.systemContent.activeTools && step.systemContent.activeTools.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-1 text-amber-300 font-semibold">
                    <Wrench className="h-3 w-3" />
                    <span>{t("agent.activeToolsList")}</span>
                  </div>
                  <div className="flex flex-col gap-1.5 pl-1">
                    {groupToolsByCategory(step.systemContent.activeTools).map(({ category, tools }) => {
                      const catConfig = EXECUTION_CATEGORIES[category]
                      return (
                        <div key={category} className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-white/50">
                            <span className={`h-1.5 w-1.5 rounded-full ${catConfig.dotColor}`} />
                            <span className="font-mono">{catConfig.label}</span>
                            <span className="text-white/30">({tools.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 pl-3">
                            {tools.map((tool) => (
                              <span
                                key={tool}
                                className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/70 font-mono"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 用户输入详情 */}
          {step.userContent && (
            <div className="agent-execution-flow-user-content flex flex-col gap-2">
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
              {step.userContent.text ? (
                <LxMarkdownPreview
                  html={markdownRenderer.render(step.userContent.text)}
                  previewMode="preview"
                  previewRef={previewRef}
                  className="px-0"
                  contentClassName="py-0 leading-relaxed text-white/90"
                  sanitizeCopy
                />
              ) : (
                <div className="font-sans text-white/30">{t("agent.emptyPrompt")}</div>
              )}
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
            <div className="agent-execution-flow-thinking-content custom-scrollbar max-h-60 overflow-y-auto rounded border border-purple-500/20 bg-purple-950/20 p-2 font-mono text-[11px] leading-relaxed text-purple-200/90">
              <LxMarkdownPreview
                html={markdownRenderer.render(step.thinkingContent.text)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0"
                contentClassName="py-0 leading-relaxed text-purple-200/90 [&_*]:!text-purple-200/90"
                sanitizeCopy
              />
            </div>
          )}

          {/* 工具调用详情 */}
          {step.toolContent && (
            <div className="agent-execution-flow-tool-content flex flex-col gap-2">
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
            <div className="agent-execution-flow-subagent-content flex flex-col gap-2 font-mono text-[11px]">
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
            <div className="agent-execution-flow-compaction-content flex flex-col gap-1.5 font-mono text-[11px] text-white/70">
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
              {step.assistantContent?.text && (
                <div className="mt-1 rounded bg-black/40 p-2">
                  <LxMarkdownPreview
                    html={markdownRenderer.render(step.assistantContent.text)}
                    previewMode="preview"
                    previewRef={previewRef}
                    className="px-0"
                    contentClassName="py-0 text-white/70 [&_*]:!text-white/70"
                    sanitizeCopy
                  />
                </div>
              )}
            </div>
          )}

          {/* 助手回复详情 */}
          {step.assistantContent && !step.compactionContent && (
            <div className="agent-execution-flow-assistant-content flex flex-col gap-2 font-sans text-white/90">
              <LxMarkdownPreview
                html={markdownRenderer.render(step.assistantContent.text)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0"
                contentClassName="py-0 leading-relaxed text-white/90"
                sanitizeCopy
              />
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
  scrollRef: externalScrollRef,
}: AgentExecutionFlowPanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  // 内部滚动容器引用
  const internalScrollRef = useRef<HTMLDivElement>(null)
  const targetScrollRef = externalScrollRef || internalScrollRef

  // 吸底状态与控制（默认不打开吸底）
  const [autoStick, setAutoStick] = useState(false)
  const autoStickRef = useRef(autoStick)
  autoStickRef.current = autoStick

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

  // 打开时获取系统提示词装配，若处于开启吸底状态则保持最新步骤吸底
  useEffect(() => {
    if (isOpen) {
      void fetchPromptAssembly()
    }
  }, [isOpen, fetchPromptAssembly])

  // 手动刷新提示词装配
  const handleRefresh = useCallback(() => {
    void fetchPromptAssembly()
  }, [fetchPromptAssembly])

  // 提取步骤列表：直接由实时 messages 响应式计算，AI 生成输出中实时跟进新步骤与流式内容
  const steps = useMemo(
    () => buildExecutionSteps(messages, promptAssembly),
    [messages, promptAssembly],
  )

  // 过滤后的步骤列表
  const filteredSteps = useMemo(() => {
    if (activeFilter === "all") return steps
    return steps.filter((step) => step.kind === activeFilter)
  }, [steps, activeFilter])

  // 顶部 tab 栏横向滚动控制
  const tabScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollTabLeft, setCanScrollTabLeft] = useState(false)
  const [canScrollTabRight, setCanScrollTabRight] = useState(false)

  const updateTabScrollState = useCallback((): void => {
    const el = tabScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollTabLeft(scrollLeft > 1)
    setCanScrollTabRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = tabScrollRef.current
    if (!el) return

    updateTabScrollState()

    const onScroll = (): void => updateTabScrollState()
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => updateTabScrollState())
        : null
    observer?.observe(el)

    return () => {
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      observer?.disconnect()
    }
  }, [steps.length, updateTabScrollState])

  const handleTabScroll = useCallback((direction: "left" | "right"): void => {
    const el = tabScrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -160 : 160, behavior: "smooth" })
  }, [])

  // 切换吸底滚动模式：仅改变状态开关，不立刻跳转，保持当前浏览位置
  const handleToggleAutoStick = useCallback(() => {
    setAutoStick((prev) => !prev)
  }, [])

  // 记录上一轮消息数量，用于检测用户发送新消息或收到新消息
  const prevMessagesLengthRef = useRef(messages.length)

  // 用户发送新消息后（若开启吸底模式）滚动到底部
  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length

    if (!autoStickRef.current) return
    if (messages.length > prevLength) {
      const el = targetScrollRef.current
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
      }
    }
  }, [messages.length, targetScrollRef])

  // AI 实时输出生成、步骤更新时（若开启吸底模式）持续保持在底部
  useLayoutEffect(() => {
    if (!autoStickRef.current) return
    const el = targetScrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [filteredSteps, targetScrollRef])

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
          {/* 实时吸底滚动切换按钮 */}
          <LxIconButton
            size="small"
            aria-label={t("agent.autoStickToBottom")}
            title={{
              content: autoStick ? t("agent.autoStickToBottomOn") : t("agent.autoStickToBottomOff"),
              placement: "bottom",
            }}
            className={
              autoStick
                ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/40 hover:bg-sky-500/30 hover:text-sky-200"
                : "text-white/40 hover:bg-white/5 hover:text-white/80"
            }
            onClick={handleToggleAutoStick}
          >
            <ChevronsDown className={`h-3.5 w-3.5 ${autoStick ? "text-sky-300 animate-pulse" : ""}`} />
          </LxIconButton>

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
        <div className="flex shrink-0 items-center gap-1 border-b border-white/5 bg-black/10 px-2 py-1 select-none">
          <LxIconButton
            aria-label={t("project.scrollLeft")}
            disabled={!canScrollTabLeft}
            size="small"
            onClick={() => handleTabScroll("left")}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </LxIconButton>
          <div
            ref={tabScrollRef}
            className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                activeFilter === "all"
                  ? "bg-white/15 text-white"
                  : "text-white/40 hover:bg-white/5 hover:text-white/70"
              }`}
            >
              {t("agent.filterAll")} ({filterCounts.all})
            </button>
            {filterCounts.system > 0 && (
              <button
                type="button"
                onClick={() => setActiveFilter("system")}
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "system"
                    ? "bg-indigo-500/20 text-indigo-300"
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
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "tool"
                    ? "bg-sky-500/20 text-sky-300"
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
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "thinking"
                    ? "bg-purple-500/20 text-purple-300"
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
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "subagent"
                    ? "bg-blue-500/20 text-blue-300"
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
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "user"
                    ? "bg-amber-500/20 text-amber-300"
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
                className={`shrink-0 cursor-pointer rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  activeFilter === "assistant"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-white/40 hover:bg-white/5 hover:text-white/70"
                }`}
              >
                {t("agent.filterAssistant")} ({filterCounts.assistant})
              </button>
            )}
          </div>
          <LxIconButton
            aria-label={t("project.scrollRight")}
            disabled={!canScrollTabRight}
            size="small"
            onClick={() => handleTabScroll("right")}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      )}

      {/* 步骤列表内容区 */}
      {steps.length > 0 ? (
        <div
          ref={targetScrollRef}
          className="custom-scrollbar min-h-0 flex-1 overflow-y-scroll [scrollbar-gutter:stable] px-3 py-2"
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
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-white/40">
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
