import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Zap,
} from "lucide-react"
import type React from "react"
import { useCallback, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionStep } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { FlowItemAssistantContent } from "./FlowItemAssistantContent"
import { FlowItemCompactionContent } from "./FlowItemCompactionContent"
import { FlowItemErrorContent } from "./FlowItemErrorContent"
import { FlowItemQuestionContent } from "./FlowItemQuestionContent"
import { FlowItemSubagentContent } from "./FlowItemSubagentContent"
import { FlowItemSystemContent } from "./FlowItemSystemContent"
import { FlowItemThinkingContent } from "./FlowItemThinkingContent"
import { FlowItemToolContent } from "./FlowItemToolContent"
import { FlowItemToolTitle } from "./FlowItemToolTitle"
import { FlowItemUserContent } from "./FlowItemUserContent"
import {
  copyToClipboard,
  formatDurationMs,
  formatJsonString,
  formatTokenCount,
  getKindMeta,
} from "./types"

export interface AgentExecutionFlowItemProps {
  step: ExecutionStep
  isExpanded: boolean
  onToggleExpand: () => void
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

  const isRunning = step.status === "running"
  const isQuestionStep = step.toolContent?.toolName === "question"

  // running 期间强制折叠详情（question 挂起面板除外），加载结束后才按默认规则展开
  const effectiveExpanded = isQuestionStep ? isExpanded : isExpanded && !isRunning

  const handleToggleExpand = useCallback((): void => {
    if (isRunning && !isQuestionStep) return
    onToggleExpand()
  }, [isRunning, isQuestionStep, onToggleExpand])

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
    if (step.errorContent) {
      return step.errorContent.message || step.title
    }
    return step.title
  }, [step])

  return (
    <div className="agent-execution-flow-step rounded-[6px] border border-white/5 bg-[#212121] transition-colors hover:border-white/10">
      {/* 头部摘要栏 */}
      <div
        role="button"
        tabIndex={0}
        onClick={handleToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handleToggleExpand()
          }
        }}
        className="agent-execution-flow-step-header flex h-8 cursor-pointer items-center justify-between gap-2 px-2.5 select-none"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 leading-none">
          {/* 折叠箭头 */}
          <div className="flex shrink-0 items-center text-white/40">
            {effectiveExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </div>

          {/* 步骤全局索引 */}
          <span className="shrink-0 font-mono text-[11px] font-medium leading-none text-white/35">
            #{step.stepIndex}
          </span>

          {/* 类型标签 */}
          <LxTag size="small" color={meta.tagColor} className="shrink-0 leading-none">
            <span className={`leading-none ${meta.textColor}`}>
              {meta.customLabel || (meta.labelKey ? t(meta.labelKey) : "")}
            </span>
          </LxTag>

          {/* 用户步骤中的 Trigger Command 标签 */}
          {step.kind === "user" && step.userContent?.command && (
            <LxTag size="small" color="amber" className="shrink-0 leading-none">
              <span className="inline-flex items-center gap-1 font-mono text-amber-300 leading-none">
                <Zap className="h-3 w-3" />/{step.userContent.command.name}
              </span>
            </LxTag>
          )}

          {/* 步骤标题与副标题 */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
            {step.kind === "tool" && step.toolContent ? (
              <FlowItemToolTitle toolContent={step.toolContent} />
            ) : step.kind === "user" ? null : (
              <span
                className={`truncate font-mono text-[12px] font-medium leading-none ${
                  step.kind === "error"
                    ? step.errorContent?.isAborted
                      ? "text-amber-300"
                      : "text-red-400"
                    : "text-white/85"
                }`}
              >
                {step.status === "running" &&
                (step.kind === "assistant" || step.kind === "thinking")
                  ? "..."
                  : step.title}
              </span>
            )}
            {step.kind !== "tool" &&
              step.kind !== "user" &&
              step.subtitle &&
              step.status !== "running" && (
                <span className="hidden min-w-0 truncate text-[11px] leading-none text-white/40 sm:inline">
                  {step.subtitle}
                </span>
              )}
          </div>
        </div>

        {/* 右侧状态与指标 */}
        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] leading-none">
          {/* 单步耗时指标：必须显示，禁止隐藏 */}
          {step.durationMs !== undefined && step.status !== "running" && (
            <span
              data-testid="flow-item-duration"
              className="agent-execution-flow-step-duration shrink-0 font-mono text-[11px] font-medium leading-none text-white/50"
            >
              {formatDurationMs(step.durationMs)}
            </span>
          )}

          {/* Token 指标（非 assistant 步骤展示） */}
          {step.kind !== "assistant" &&
            step.tokens?.total !== undefined &&
            step.status !== "running" && (
              <span className="hidden shrink-0 leading-none text-white/35 sm:inline">
                {formatTokenCount(step.tokens.total)} tok
              </span>
            )}

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
              className="text-rose-400"
            >
              <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
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

      {/* question 问答面板：挂起时默认展开，完成后默认折叠；折叠时保留作答状态以支持多选。 */}
      {step.toolContent?.toolName === "question" && (
        <div
          hidden={!isExpanded}
          className="agent-execution-flow-step-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-[12px]"
        >
          <FlowItemQuestionContent content={step.toolContent} />
        </div>
      )}

      {/* 展开详情区（question 工具的详情已内嵌展示，跳过空详情体） */}
      {effectiveExpanded && step.toolContent?.toolName !== "question" ? (
        <div className="agent-execution-flow-step-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-[12px]">
          {/* 系统提示词与注入详情 */}
          {step.systemContent && <FlowItemSystemContent content={step.systemContent} />}

          {/* 用户输入详情 */}
          {step.userContent && (
            <FlowItemUserContent content={step.userContent} previewRef={previewRef} />
          )}

          {/* 思考过程详情 */}
          {step.thinkingContent && (
            <FlowItemThinkingContent content={step.thinkingContent} previewRef={previewRef} />
          )}

          {/* 工具调用详情 */}
          {step.toolContent && <FlowItemToolContent content={step.toolContent} />}

          {/* 子代理详情 */}
          {step.subagentContent && <FlowItemSubagentContent content={step.subagentContent} />}

          {/* 上下文压缩详情 */}
          {step.compactionContent && (
            <FlowItemCompactionContent
              content={step.compactionContent}
              assistantContent={step.assistantContent}
              previewRef={previewRef}
            />
          )}

          {/* 助手回复详情 */}
          {step.assistantContent && !step.compactionContent && (
            <FlowItemAssistantContent content={step.assistantContent} previewRef={previewRef} />
          )}

          {/* 异常/中断详情 */}
          {step.errorContent && (
            <FlowItemErrorContent content={step.errorContent} fallbackTitle={step.title} />
          )}
        </div>
      ) : null}
    </div>
  )
}
