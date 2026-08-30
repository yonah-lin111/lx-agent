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
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { ExecutionStep } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { AgentExecutionFlowItem } from "./AgentExecutionFlowItem"
import { FlowItemToolTitle } from "./FlowItemToolTitle"
import {
  copyToClipboard,
  formatDurationMs,
  formatJsonString,
  formatTokensShort,
} from "./types"

export interface AgentExecutionFlowGroupProps {
  groupId: string
  steps: ExecutionStep[]
  isExpanded: boolean
  onToggleExpand: () => void
  isStepExpanded: (step: ExecutionStep) => boolean
  onToggleStepExpand: (step: ExecutionStep) => void
}

/**
 * AgentExecutionFlowGroup - 连续非 AI / 思考 / todo / question 的执行步骤折叠组组件
 * 默认不展开（包括运行中也不展开）；在 group 头部实时展示当前执行步骤（如运行中的 tool 或最新完成的 tool）
 */
export const AgentExecutionFlowGroup = ({
  steps,
  isExpanded,
  onToggleExpand,
  isStepExpanded,
  onToggleStepExpand,
}: AgentExecutionFlowGroupProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)

  if (steps.length === 0) {
    return null
  }

  // 计算当前组的状态及代表性步骤
  const runningStep = useMemo(() => steps.find((s) => s.status === "running"), [steps])
  const errorStep = useMemo(() => steps.find((s) => s.status === "error"), [steps])
  const lastStep = steps[steps.length - 1]
  const activeStep = runningStep || lastStep

  // 计算运行时长（支持 running 动态累计计时）
  const [runningElapsedMs, setRunningElapsedMs] = useState(0)
  const isRunning = Boolean(runningStep)
  const isError = Boolean(!isRunning && errorStep)
  const isDone = !isRunning && !isError

  // 聚合静态总耗时与总 Token（优先按首尾时间戳跨度计算，兼顾单步累加保底）
  const {
    staticDurationMs,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    firstTimestamp,
  } = useMemo(() => {
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
      firstTimestamp: firstTs,
    }
  }, [steps])

  // 运行中的实时动态耗时更新（若存在首个时间戳则直接以 Date.now() - firstTimestamp 动态刷新）
  useEffect(() => {
    if (!isRunning) {
      setRunningElapsedMs(0)
      return
    }
    const baseTs = firstTimestamp ?? runningStep?.timestamp
    if (!baseTs) {
      setRunningElapsedMs(0)
      return
    }
    const updateElapsed = () => {
      setRunningElapsedMs(Math.max(0, Date.now() - baseTs))
    }
    updateElapsed()
    const timer = setInterval(updateElapsed, 500)
    return () => clearInterval(timer)
  }, [isRunning, firstTimestamp, runningStep?.timestamp])

  const totalDurationMs = isRunning
    ? firstTimestamp
      ? runningElapsedMs
      : staticDurationMs + runningElapsedMs
    : staticDurationMs

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
      className="agent-execution-flow-group rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-surface,#212121)] transition-colors hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.12))]"
    >
      {/* 头部摘要栏（固定双行展示） */}
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
        className="agent-execution-flow-group-header flex cursor-pointer flex-col justify-center gap-1 py-1.5 px-2.5 select-none transition-colors hover:bg-white/[0.02]"
      >
        {/* 第一行：折叠箭头、Group 标题、数量、右侧总耗时与状态图标 */}
        <div className="flex h-5 w-full items-center justify-between gap-2 leading-none">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 leading-none overflow-hidden">
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
            <span className="shrink-0 font-mono text-[12px] font-semibold text-[var(--color-theme-text,#ffffff)]/90">
              Execute Group
            </span>
            <span className="shrink-0 font-mono text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))]">
              ({steps.length})
            </span>
          </div>

          {/* 右侧总运行时间与状态指标 */}
          <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] leading-none">
            {totalDurationMs > 0 && (
              <span
                data-testid="flow-group-duration"
                className={`agent-execution-flow-step-duration shrink-0 font-mono text-[11px] font-medium leading-none ${
                  isRunning ? "text-sky-300" : "text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))]"
                }`}
              >
                {formatDurationMs(totalDurationMs)}
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
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
              </LxIconButton>
            )}
            {isError && (
              <LxIconButton
                size="small"
                aria-label="Error"
                title={{ content: "Error", placement: "left" }}
                className="text-rose-400"
              >
                <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
              </LxIconButton>
            )}
            {isDone && (
              <LxIconButton
                size="small"
                aria-label="Done"
                title={{ content: "Done", placement: "left" }}
                className="text-emerald-400/80"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
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
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]" />
                )}
              </LxIconButton>
            )}
          </div>
        </div>

        {/* 第二行：展示代表步骤标题（运行中为正在运行项，完成态为最后项） */}
        {activeStep && (
          <div className="flex min-w-0 items-center gap-1.5 overflow-hidden pl-5 text-[11px] leading-none text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
            <CornerDownRight
              className={`h-3 w-3 shrink-0 ${isRunning ? "text-sky-400/80" : "text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]"}`}
            />
            {activeStep.kind === "tool" && activeStep.toolContent ? (
              <FlowItemToolTitle toolContent={activeStep.toolContent} />
            ) : (
              <span className="truncate font-mono text-[11px] text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
                {activeStep.title}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 展开子步骤列表 */}
      {isExpanded && (
        <div className="agent-execution-flow-group-body border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] bg-[var(--color-theme-bg,#000000)]/20 p-2">
          <div className="flex flex-col gap-1.5">
            {steps.map((step) => (
              <AgentExecutionFlowItem
                key={step.id}
                step={step}
                isExpanded={isStepExpanded(step)}
                onToggleExpand={() => onToggleStepExpand(step)}
              />
            ))}
          </div>
        </div>
      )}

      {/* 底部 Token 指标栏：折叠与展开状态下均可见，存在有效 Token 时始终渲染（包括 running 状态） */}
      {(inputTokens > 0 || outputTokens > 0 || totalTokens > 0) && (
        <div className="agent-execution-flow-group-footer flex items-center justify-start border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] px-2.5 py-1 select-none">
          <LxTooltip
            placement="top"
            content={
              <div className="flex flex-col gap-0.5 font-mono text-[11px]">
                <span>Input: {inputTokens.toLocaleString()}</span>
                <span>Output: {outputTokens.toLocaleString()}</span>
                {cacheReadTokens > 0 && (
                  <span>Cache read: {cacheReadTokens.toLocaleString()}</span>
                )}
              </div>
            }
          >
            <span className="flex items-center gap-1 font-mono text-[10px] leading-none text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))] select-text tabular-nums whitespace-nowrap cursor-default hover:text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))] transition-colors">
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
