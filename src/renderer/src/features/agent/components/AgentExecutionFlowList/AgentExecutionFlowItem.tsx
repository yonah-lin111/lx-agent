import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  FileCode,
  FileText,
  Layers,
  Loader2,
  Sliders,
  Terminal,
  Wrench,
  Zap,
} from "lucide-react"
import type React from "react"
import { useCallback, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTag } from "@/components/ui/LxTag"
import {
  CATEGORY_ORDER,
  EXECUTION_CATEGORIES,
  type ExecutionCategoryKey,
  getToolExecutionCategory,
} from "@/features/agent/components/blocks"
import type { ExecutionStep } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { copyToClipboard, formatJsonString, getKindMeta } from "./types"

export interface AgentExecutionFlowItemProps {
  step: ExecutionStep
  isExpanded: boolean
  onToggleExpand: () => void
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

/**
 * 单个执行步骤条目展示组件
 */
export const AgentExecutionFlowItem = ({
  step,
  isExpanded,
  onToggleExpand,
}: AgentExecutionFlowItemProps): React.JSX.Element => {
  const { t } = useTranslation()
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
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onToggleExpand()
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
            {step.kind === "tool" && step.toolContent ? (
              (() => {
                const toolName = step.toolContent.toolName
                if (toolName === "read_skill") {
                  const skillName =
                    typeof step.toolContent.args?.name === "string" &&
                    step.toolContent.args.name.trim()
                      ? step.toolContent.args.name.trim()
                      : "Skill"
                  return (
                    <span className="shrink-0 font-mono text-[12px] font-medium text-violet-300">
                      {skillName}
                    </span>
                  )
                }
                if (toolName === "web_search" || toolName === "webfetch") {
                  return (
                    <span className="shrink-0 font-mono text-[12px] font-medium text-emerald-300">
                      {toolName}
                    </span>
                  )
                }
                if (toolName === "todowrite") {
                  return (
                    <span className="shrink-0 font-mono text-[12px] font-medium text-orange-300">
                      {toolName}
                    </span>
                  )
                }
                if (toolName.includes("_")) {
                  const sepIdx = toolName.indexOf("_")
                  const serverName = toolName.slice(0, sepIdx)
                  const method = toolName.slice(sepIdx + 1)
                  return (
                    <span className="shrink-0 font-mono text-[12px] font-medium text-cyan-300">
                      MCP · {serverName} · {method}
                    </span>
                  )
                }
                return (
                  <span className="shrink-0 font-mono text-[12px] font-medium text-amber-300">
                    {toolName}
                  </span>
                )
              })()
            ) : (
              <span className="truncate font-mono text-[12px] font-medium text-white/85">
                {step.status === "running" &&
                (step.kind === "assistant" || step.kind === "thinking")
                  ? "..."
                  : step.title}
              </span>
            )}
            {step.kind !== "tool" && step.subtitle && step.status !== "running" && (
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
                    {groupToolsByCategory(step.systemContent.activeTools).map(
                      ({ category, tools }) => {
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
                      },
                    )}
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
