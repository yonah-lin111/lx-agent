import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownRight,
  Loader2,
} from "lucide-react"
import type React from "react"
import { Fragment, useCallback, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  isMcpToolCall,
  isSkillToolCall,
} from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import type { ExecutionStep, ExecutionSubagentContent } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"
import { AgentExecutionFlowItemMemo } from "./AgentExecutionFlowItemMemo"
import {
  copyToClipboard,
  formatDurationMs,
  formatJsonString,
  formatTokensShort,
  isWebSearchTool,
} from "./types"

export interface AgentExecutionFlowGroupProps {
  groupId: string
  steps: ExecutionStep[]
  isExpanded: boolean
  onToggleExpand: () => void
  isStepExpanded: (step: ExecutionStep) => boolean
  onToggleStepExpand: (step: ExecutionStep) => void
  onOpenSubagent?: (content: ExecutionSubagentContent) => void
  isStreamingActive?: boolean
}

/**
 * AgentExecutionFlowGroup - 连续非 AI / 思考 / todo / question 的执行步骤折叠组组件
 * 默认不展开（包括运行中也不展开）；时间与 Token 指标仅在 group 执行完成后展示。
 */
export const AgentExecutionFlowGroup = ({
  steps,
  isExpanded,
  onToggleExpand,
  isStepExpanded,
  onToggleStepExpand,
  onOpenSubagent,
  isStreamingActive = false,
}: AgentExecutionFlowGroupProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)

  if (steps.length === 0) {
    return null
  }

  // 计算当前组的状态：running 步骤存在或仍是流式尾部（后方无不可折叠 item）时视为运行中
  const runningStep = useMemo(() => steps.find((s) => s.status === "running"), [steps])
  const errorStep = useMemo(() => steps.find((s) => s.status === "error"), [steps])
  const isRunning = Boolean(runningStep || isStreamingActive)
  const isError = Boolean(!isRunning && errorStep)
  const isDone = !isRunning && !isError

  // 组内调用类型统计（分类优先级与消息列表执行组一致：skill → webSearch → mcp → tool）
  const statsSegments = useMemo(() => {
    let thoughts = 0
    let toolCalls = 0
    let skillCalls = 0
    let mcpCalls = 0
    let webSearches = 0

    for (const step of steps) {
      if (step.kind === "thinking") {
        thoughts++
        continue
      }
      if (step.kind !== "tool") continue
      const toolName = step.toolContent?.toolName || step.title
      if (isSkillToolCall(toolName)) {
        skillCalls++
      } else if (isWebSearchTool(toolName)) {
        webSearches++
      } else if (isMcpToolCall(toolName)) {
        mcpCalls++
      } else {
        toolCalls++
      }
    }

    const segments: { count: number; singular: TranslationKey; plural: TranslationKey }[] = [
      { count: thoughts, singular: "agent.statsThought", plural: "agent.statsThoughts" },
      { count: toolCalls, singular: "agent.statsToolCall", plural: "agent.statsToolCalls" },
      { count: skillCalls, singular: "agent.statsSkillCall", plural: "agent.statsSkillCalls" },
      { count: mcpCalls, singular: "agent.statsMcpCall", plural: "agent.statsMcpCalls" },
      { count: webSearches, singular: "agent.statsWebSearch", plural: "agent.statsWebSearches" },
    ]
    return segments.filter((segment) => segment.count > 0)
  }, [steps])

  // 聚合静态总耗时与总 Token（优先按首尾时间戳跨度计算，兼顾单步累加保底）
  const { staticDurationMs, totalTokens, inputTokens, outputTokens, cacheReadTokens } =
    useMemo(() => {
      let sumDuration = 0
      let tokens = 0
      let input = 0
      let output = 0
      let cacheRead = 0
      let firstTs: number | undefined
      let lastTs: number | undefined
      let lastStepDuration: number | undefined

      for (const step of steps) {
        if (step.durationMs !== undefined) {
          sumDuration += step.durationMs
        }
        if (step.tokens) {
          if (step.tokens.total !== undefined) {
            tokens += step.tokens.total
          }
          if (step.tokens.input !== undefined) {
            input += step.tokens.input
          }
          if (step.tokens.output !== undefined) {
            output += step.tokens.output
          }
          if (step.tokens.cacheRead !== undefined) {
            cacheRead += step.tokens.cacheRead
          }
        }
        if (step.timestamp !== undefined) {
          if (firstTs === undefined) {
            firstTs = step.timestamp
          }
          lastTs = step.timestamp
          lastStepDuration = step.durationMs
        }
      }

      let calculatedDuration = sumDuration
      if (firstTs !== undefined && lastTs !== undefined && lastTs >= firstTs) {
        const span =
          lastTs -
          firstTs +
          (lastStepDuration !== undefined && lastStepDuration > 0 ? lastStepDuration : 0)
        if (span > 0) {
          calculatedDuration = span
        }
      }

      return {
        staticDurationMs: calculatedDuration,
        totalTokens: tokens,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
      }
    }, [steps])

  // 聚合复制文本
  const copyPayload = useMemo(() => {
    return steps
      .map((step) => {
        if (step.toolContent) {
          return `[${step.kind}] Tool: ${step.toolContent.toolName}\nArgs:\n${formatJsonString(
            step.toolContent.args,
          )}\nResult:\n${step.toolContent.result ?? ""}`
        }
        if (step.thinkingContent) {
          return `[thinking]\n${step.thinkingContent.text}`
        }
        if (step.subagentContent) {
          return `[${step.kind}] Subagent: ${step.subagentContent.name}\n${formatJsonString(
            step.subagentContent.subagent,
          )}`
        }
        if (step.systemContent) {
          return `[${step.kind}] ${step.systemContent.rendered}`
        }
        return `[${step.kind}] ${step.title}`
      })
      .join("\n\n---\n\n")
  }, [steps])

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation()
      const success = await copyToClipboard(copyPayload)
      if (success) {
        setIsCopied(true)
        setTimeout(() => setIsCopied(false), 1500)
      }
    },
    [copyPayload],
  )

  return (
    <div
      data-flow-group="true"
      data-expanded={isExpanded}
      className="agent-execution-flow-group rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-white/[0.06] transition-colors hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.12))] hover:bg-white/[0.09]"
    >
      {/* 头部摘要栏（标题区两行：第一行折叠箭头/标题/数量，第二行调用统计；右侧状态图标与完成后的总耗时） */}
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
        className="agent-execution-flow-group-header flex cursor-pointer items-center justify-between gap-2 py-1.5 px-2.5 select-none transition-colors hover:bg-white/[0.02]"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1 overflow-hidden">
          {/* 第一行：折叠箭头、Group 标识小圆点、标题与数量 */}
          <div className="flex min-w-0 items-center gap-1.5 leading-none">
            {/* 折叠箭头 */}
            <div className="flex shrink-0 items-center text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))]">
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </div>

            {/* Group 标识小圆点与标题 */}
            <span
              aria-hidden
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                isRunning ? "bg-sky-400 animate-pulse" : isError ? "bg-rose-400" : "bg-white/80"
              }`}
            />
            <span className="shrink-0 font-mono text-xs font-semibold text-[var(--color-theme-text,#ffffff)]/90">
              Execute Group
            </span>
            <span className="shrink-0 font-mono text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))]">
              ({steps.length})
            </span>
          </div>

          {/* 第二行：直角 icon 与调用类型统计（与消息列表执行组一致；运行中实时更新，0 计数不渲染） */}
          {statsSegments.length > 0 && (
            <div
              data-testid="flow-group-stats"
              className="agent-execution-flow-group-stats-row flex min-w-0 items-start gap-1.5 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))]"
            >
              {/* 与折叠箭头同宽占位，使直角 icon 落在第一行小圆点正下方 */}
              <span aria-hidden className="w-3.5 shrink-0" />
              <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))]" />
              <span className="agent-execution-flow-group-stats flex min-w-0 flex-1 flex-wrap items-center leading-relaxed">
                {statsSegments.map((segment, index) => (
                  <Fragment key={segment.plural}>
                    {index > 0 && <span className="px-1 opacity-40">·</span>}
                    <span>{segment.count}</span>
                    <span className="ml-0.5">
                      {segment.count === 1 ? t(segment.singular) : t(segment.plural)}
                    </span>
                  </Fragment>
                ))}
              </span>
            </div>
          )}
        </div>

        {/* 右侧指标与状态：总耗时仅在 group 执行完成后展示 */}
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-xs leading-none">
          {!isRunning && staticDurationMs > 0 && (
            <span
              data-testid="flow-group-duration"
              className="agent-execution-flow-step-duration shrink-0 font-mono text-xs font-medium leading-none text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))]"
            >
              {formatDurationMs(staticDurationMs)}
            </span>
          )}

          {/* 状态图标 */}
          {isRunning && (
            <LxIconButton
              size="small"
              aria-label="Running"
              title={{ content: "Running", placement: "left" }}
              className="text-sky-400"
            >
              <Loader2 className="animate-spin text-sky-400" />
            </LxIconButton>
          )}
          {isError && (
            <LxIconButton
              size="small"
              aria-label="Error"
              title={{ content: "Error", placement: "left" }}
              className="text-rose-400"
            >
              <AlertCircle className="text-rose-400" />
            </LxIconButton>
          )}
          {isDone && (
            <LxIconButton
              size="small"
              aria-label="Done"
              title={{ content: "Done", placement: "left" }}
              className="text-emerald-400/80"
            >
              <CheckCircle2 className="text-emerald-400/80" />
            </LxIconButton>
          )}

          {/* 快捷复制全部步骤 */}
          {!isRunning && (
            <LxIconButton
              size="small"
              aria-label={t("agent.copyContent")}
              title={{
                content: isCopied ? t("common.copied") : t("agent.copyContent"),
                placement: "left",
              }}
              onClick={handleCopy}
            >
              {isCopied ? (
                <Check className="text-emerald-400" />
              ) : (
                <Copy className="text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]" />
              )}
            </LxIconButton>
          )}
        </div>
      </div>

      {/* 展开子步骤列表 */}
      {isExpanded && (
        <div className="agent-execution-flow-group-body border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-bg,#000000)]/20 p-2">
          <div className="flex flex-col gap-1.5">
            {steps.map((step) => (
              <AgentExecutionFlowItemMemo
                key={step.id}
                step={step}
                isExpanded={isStepExpanded(step)}
                onToggleExpand={() => onToggleStepExpand(step)}
                onOpenSubagent={onOpenSubagent}
              />
            ))}
          </div>
        </div>
      )}

      {/* 底部 Token 指标栏：仅在 group 执行完成后展示（运行中不渲染，避免指标频繁跳动） */}
      {!isRunning && (inputTokens > 0 || outputTokens > 0 || totalTokens > 0) && (
        <div className="agent-execution-flow-group-footer flex items-center justify-start border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-2.5 py-1 select-none">
          <LxTooltip
            placement="top"
            content={
              <div className="flex flex-col gap-0.5 font-mono text-xs">
                <span>Input: {inputTokens.toLocaleString()}</span>
                <span>Output: {outputTokens.toLocaleString()}</span>
                {cacheReadTokens > 0 && <span>Cache read: {cacheReadTokens.toLocaleString()}</span>}
              </div>
            }
          >
            <span className="flex items-center gap-1 font-mono text-xs leading-none text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))] select-text tabular-nums whitespace-nowrap cursor-default hover:text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))] transition-colors">
              <span>IN {formatTokensShort(inputTokens)}</span>
              <span aria-hidden="true" className="opacity-40">
                ·
              </span>
              <span>OUT {formatTokensShort(outputTokens)}</span>
              {cacheReadTokens > 0 && (
                <>
                  <span aria-hidden="true" className="opacity-40">
                    ·
                  </span>
                  <span>CACHE {formatTokensShort(cacheReadTokens)}</span>
                </>
              )}
            </span>
          </LxTooltip>
        </div>
      )}
    </div>
  )
}
