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
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import {
  cleanUserPrompt,
  extractSkillBlock,
} from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import {
  FrontDesignCard,
  ProposedPlanCard,
  ReviewFindingsCard,
  resolveSubagentStatusRow,
  SubagentStatusRow,
  ToolCallTitle,
} from "@/features/agent/components/blocks"
import type { ExecutionStep, ProposedPlanData, ReviewFindingItem } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { FlowItemAssistantContent } from "./FlowItemAssistantContent"
import { FlowItemCompactionContent } from "./FlowItemCompactionContent"
import { FlowItemErrorContent } from "./FlowItemErrorContent"
import { FlowItemModelSwitchContent } from "./FlowItemModelSwitchContent"
import { FlowItemQuestionContent } from "./FlowItemQuestionContent"
import { FlowItemSubagentContent } from "./FlowItemSubagentContent"
import { FlowItemSystemContent } from "./FlowItemSystemContent"
import { FlowItemThinkingContent } from "./FlowItemThinkingContent"
import { FlowItemTokenSaverBadge } from "./FlowItemTokenSaverBadge"
import { FlowItemToolContent } from "./FlowItemToolContent"
import { FlowItemUndoContent } from "./FlowItemUndoContent"
import { FlowItemUserContent } from "./FlowItemUserContent"
import {
  copyToClipboard,
  formatDurationMs,
  formatJsonString,
  formatTokensShort,
  getKindMeta,
  PARALLEL_BATCH_COLORS,
} from "./types"

export interface AgentExecutionFlowItemProps {
  step: ExecutionStep
  isExpanded: boolean
  onToggleExpand: () => void
  onOpenSubagent?: (stepId: string, subagentIndex?: number) => void
  onAcceptPlan?: (plan: ProposedPlanData) => void
  onApplyReviewFixes?: (selectedFindings: ReviewFindingItem[]) => void
  onFillInput?: (text: string) => void
  hasSubsequentUserMessage?: boolean
}

/**
 * 单个执行步骤条目展示组件
 */
export const AgentExecutionFlowItem = ({
  step,
  isExpanded,
  onToggleExpand,
  onOpenSubagent,
  onAcceptPlan,
  onApplyReviewFixes,
  onFillInput,
  hasSubsequentUserMessage = false,
}: AgentExecutionFlowItemProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isCopied, setIsCopied] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  const meta = getKindMeta(step)

  const isRunning = step.status === "running"

  // 时间/token 等指标仅在步骤执行完成后展示；运行中不渲染，避免指标频繁跳动
  const hasTokenMetrics =
    (step.tokens?.input ?? 0) > 0 || (step.tokens?.output ?? 0) > 0 || (step.tokens?.total ?? 0) > 0
  const showTokenMetrics = !isRunning && hasTokenMetrics
  const isParallelBatchTotal = Boolean(
    step.kind !== "subagent" &&
      step.parallel &&
      step.parallel.total > 1 &&
      step.parallel.index === step.parallel.total,
  )
  const showFooter =
    showTokenMetrics ||
    Boolean(step.parallel) ||
    (step.kind === "subagent" && Boolean(step.subagentContent))

  // 子代理状态行：运行中展示当前内部工具，完成后展示调用统计（与消息列表子代理卡片同构）。
  const hasSubagentStatusRow = useMemo(
    () =>
      step.kind === "subagent" &&
      resolveSubagentStatusRow(step.subagentContent?.subagent, step.status) !== null,
    [step.kind, step.status, step.subagentContent?.subagent],
  )

  const effectiveExpanded = isExpanded

  // 解析用户步骤中的 Skill 名称与 markdown 说明（用于 hover 时的 LxInfoTooltip）
  const skillName = useMemo(() => {
    if (step.kind === "user" && step.userContent?.command?.kind === "skill") {
      return step.userContent.command.name.replace(/^[\/\$]/, "")
    }
    return null
  }, [step.kind, step.userContent?.command])

  const skillContentFromBlock = useMemo(() => {
    if (!skillName || !step.userContent?.text) return null
    return extractSkillBlock(step.userContent.text)
  }, [skillName, step.userContent?.text])

  const [fetchedSkillContent, setFetchedSkillContent] = useState<string | null>(null)

  useEffect(() => {
    if (!skillName || skillContentFromBlock) return
    void agentApi.getSkillContent(skillName).then((content) => {
      if (content) setFetchedSkillContent(content)
    })
  }, [skillName, skillContentFromBlock])

  const activeSkillMarkdown = skillContentFromBlock || fetchedSkillContent || ""

  const handleToggleExpand = useCallback((): void => {
    onToggleExpand()
  }, [onToggleExpand])

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
    if (step.userContent) {
      return cleanUserPrompt(step.userContent.text, {
        isSteer: step.userContent.isSteer,
        command: step.userContent.command,
      })
    }
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
    if (step.undoContent) {
      return `${step.title}\n${step.undoContent.userPrompt || ""}`
    }
    if (step.modelSwitchContent) {
      return `${step.title}\n${step.modelSwitchContent.instructions || ""}`
    }
    if (step.hookContent) return step.hookContent.text || step.title
    if (step.planContent) return step.planContent.content
    if (step.reviewFindingsContent) return step.reviewFindingsContent.raw
    if (step.frontDesignContent) return step.frontDesignContent.raw || step.frontDesignContent.html
    if (step.assistantContent) return step.assistantContent.text
    if (step.errorContent) {
      return step.errorContent.message || step.title
    }
    return step.title
  }, [step])

  const bodyStyleClass = useMemo(() => {
    if (step.kind === "user") {
      return "agent-execution-flow-step-body--user agent-execution-flow-step-body--amber border-amber-500/15 bg-amber-500/[0.05]"
    }
    if (step.kind === "assistant") {
      return "agent-execution-flow-step-body--assistant agent-execution-flow-step-body--emerald border-emerald-500/15 bg-emerald-500/[0.05]"
    }
    if (step.kind === "thinking") {
      return "agent-execution-flow-step-body--thinking border-white/5 bg-black/25"
    }
    if (step.kind === "undo") {
      return "agent-execution-flow-step-body--undo agent-execution-flow-step-body--rose border-rose-500/15 bg-rose-500/[0.05]"
    }
    if (step.kind === "modelSwitch") {
      return "agent-execution-flow-step-body--modelSwitch agent-execution-flow-step-body--cyan border-cyan-500/15 bg-cyan-500/[0.05]"
    }
    if (step.kind === "frontDesign") {
      return "agent-execution-flow-step-body--frontDesign agent-execution-flow-step-body--pink border-pink-500/15 bg-pink-500/[0.05]"
    }
    if (step.kind === "hook") {
      return "agent-execution-flow-step-body--hook border-orange-500/15 bg-orange-500/[0.05]"
    }
    const toolName = step.toolContent?.toolName
    if (toolName === "todowrite") {
      return "agent-execution-flow-step-body--todowrite border-orange-500/20 bg-orange-500/[0.03]"
    }
    if (toolName === "wireframe") {
      return "agent-execution-flow-step-body--wireframe border-white/5 bg-black/25"
    }
    return `agent-execution-flow-step-body--${step.kind} border-white/5 bg-black/25`
  }, [step.kind, step.toolContent?.toolName])

  const isSolidBackground = step.kind === "user" || step.kind === "assistant"

  return (
    <div
      data-step-kind={step.kind}
      data-tag-color={meta.tagColor}
      data-expanded={effectiveExpanded}
      className={`agent-execution-flow-step agent-execution-flow-step--${step.kind} rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] ${
        isSolidBackground
          ? "bg-[var(--color-theme-surface,#212121)]"
          : "bg-white/[0.06] hover:bg-white/[0.09]"
      } transition-colors hover:border-[var(--color-theme-border-strong,rgba(255,255,255,0.12))]`}
    >
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
        className={`agent-execution-flow-step-header flex cursor-pointer justify-between gap-2 px-2.5 select-none hover:bg-white/[0.02] transition-colors ${
          hasSubagentStatusRow ? "items-start py-1.5" : "h-8 items-center"
        }`}
      >
        <div
          className={`flex min-w-0 flex-1 ${
            hasSubagentStatusRow
              ? "flex-col gap-1 overflow-hidden"
              : "items-center gap-1.5 leading-none"
          }`}
        >
          <div className="flex w-full min-w-0 items-center gap-1.5 leading-none">
            {/* 折叠箭头 */}
            <div className="flex shrink-0 items-center text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))]">
              {effectiveExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
            </div>

            {/* 步骤全局统一顺序索引 */}
            {!isRunning && (
              <span className="shrink-0 font-mono text-xs font-medium leading-none text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))]">
                #{step.stepIndex}
              </span>
            )}

            {/* 类型标签 */}
            <LxTag size="small" color={meta.tagColor} className="shrink-0 leading-none">
              <span className={`leading-none ${meta.textColor}`}>
                {meta.customLabel || (meta.labelKey ? t(meta.labelKey) : "")}
              </span>
            </LxTag>

            {/* 用户步骤中的指令标签（Steer / Skill / 普通命令互斥，仅渲染一个） */}
            {step.kind === "user" &&
              (step.userContent?.isSteer || step.userContent?.command) &&
              (step.userContent?.isSteer || step.userContent?.command?.name === "steer" ? (
                <LxTag size="small" color="amber" className="shrink-0 leading-none">
                  <span className="font-mono text-amber-300 leading-none">/steer</span>
                </LxTag>
              ) : step.userContent?.command?.kind === "skill" && skillName ? (
                <LxInfoTooltip
                  markdown={activeSkillMarkdown || `### ${skillName}`}
                  showIcon={false}
                  placement="top"
                >
                  <LxTag size="small" color="amber" className="shrink-0 leading-none cursor-help">
                    <span className="font-mono text-amber-300 leading-none">${skillName}</span>
                  </LxTag>
                </LxInfoTooltip>
              ) : step.userContent?.command ? (
                <LxTag size="small" color="amber" className="shrink-0 leading-none">
                  <span className="inline-flex items-center gap-1 font-mono text-amber-300 leading-none">
                    <Zap className="h-3 w-3" />/{step.userContent.command.name}
                  </span>
                </LxTag>
              ) : null)}

            {/* 步骤标题与副标题（子代理步骤：点击名称打开子代理面板，名称右侧不再展示描述） */}
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden leading-none">
              {step.kind === "tool" && step.toolContent ? (
                <ToolCallTitle toolContent={step.toolContent} />
              ) : step.kind === "user" ? null : step.kind === "subagent" && step.subagentContent ? (
                <span
                  data-testid="flow-item-subagent-open-btn"
                  aria-label={t("agent.viewSubagentDetails")}
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenSubagent?.(step.id)
                  }}
                  className="truncate font-mono text-xs font-medium leading-none text-blue-300 transition-colors hover:text-blue-200 focus:outline-none"
                >
                  {step.title}
                </span>
              ) : (
                <span
                  className={`truncate font-mono text-xs font-medium leading-none ${
                    step.kind === "error"
                      ? step.errorContent?.isAborted
                        ? "text-amber-300"
                        : "text-red-400"
                      : "text-[var(--color-theme-text,#ffffff)]/90"
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
                step.kind !== "subagent" &&
                step.subtitle &&
                step.status !== "running" && (
                  <span className="hidden min-w-0 truncate text-xs leading-none text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] sm:inline">
                    {step.subtitle}
                  </span>
                )}
            </div>
          </div>

          {/* 子代理状态行：运行中当前内部工具 / 完成后调用统计（与消息列表子代理卡片同一渲染）。 */}
          {step.kind === "subagent" && (
            <SubagentStatusRow
              subagent={step.subagentContent?.subagent}
              status={step.status}
              testId="flow-item-subagent-status"
              className="agent-execution-flow-step-subagent-status-row"
            />
          )}
        </div>

        {/* 右侧状态与指标 */}
        <div className="flex h-3.5 shrink-0 items-center gap-1.5 font-mono text-xs leading-none">
          {/* 单步耗时指标：区分自身执行耗时与模型响应/步进跨度 */}
          {step.status !== "running" && (
            <>
              {step.durationMs !== undefined &&
              step.kind !== "undo" &&
              step.kind !== "modelSwitch" &&
              step.kind !== "compaction" ? (
                step.kind === "user" ? (
                  step.durationMs > 0 ? (
                    <LxTooltip
                      content={
                        <span className="text-[var(--color-theme-text,#ffffff)]/80">
                          {t("agent.agentOverhead", {
                            duration: formatDurationMs(step.durationMs),
                          })}
                        </span>
                      }
                      placement="left"
                    >
                      <span
                        data-testid="flow-item-duration"
                        className="agent-execution-flow-step-duration shrink-0 font-mono text-xs font-medium leading-none text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))] hover:text-[var(--color-theme-text,#ffffff)]/80 cursor-default"
                      >
                        {formatDurationMs(step.durationMs)}
                      </span>
                    </LxTooltip>
                  ) : null
                ) : step.agentOverheadMs !== undefined && step.agentOverheadMs >= 100 ? (
                  <LxTooltip
                    content={
                      <div className="flex flex-col gap-0.5 font-mono text-xs leading-tight">
                        <div className="text-[var(--color-theme-text,#ffffff)]/80">
                          {t("agent.stepDuration", { duration: formatDurationMs(step.durationMs) })}
                        </div>
                        <div className="text-amber-400">
                          {t("agent.agentOverhead", {
                            duration: formatDurationMs(step.agentOverheadMs),
                          })}
                        </div>
                        <div className="border-t border-[var(--color-theme-border,rgba(255,255,255,0.1))] pt-0.5 text-[var(--color-theme-text-muted,rgba(255,255,255,0.6))]">
                          {t("agent.stepSpan", {
                            duration: formatDurationMs(
                              step.stepSpanMs ?? step.durationMs + step.agentOverheadMs,
                            ),
                          })}
                        </div>
                      </div>
                    }
                    placement="left"
                  >
                    <span
                      data-testid="flow-item-duration"
                      className="agent-execution-flow-step-duration inline-flex items-center gap-1 font-mono text-xs font-medium leading-none text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))] hover:text-[var(--color-theme-text,#ffffff)]/80 cursor-default"
                    >
                      <span>{formatDurationMs(step.durationMs)}</span>
                      <span className="text-xs font-normal text-amber-400/80 hover:text-amber-300">
                        (+{formatDurationMs(step.agentOverheadMs)})
                      </span>
                    </span>
                  </LxTooltip>
                ) : (
                  <LxTooltip
                    content={t("agent.stepDuration", {
                      duration: formatDurationMs(step.durationMs),
                    })}
                    placement="left"
                  >
                    <span
                      data-testid="flow-item-duration"
                      className="agent-execution-flow-step-duration shrink-0 font-mono text-xs font-medium leading-none text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))] hover:text-[var(--color-theme-text,#ffffff)]/80 cursor-default"
                    >
                      {formatDurationMs(step.durationMs)}
                    </span>
                  </LxTooltip>
                )
              ) : null}
            </>
          )}

          {/* 状态图标按钮 */}
          {step.status === "running" && (
            <LxIconButton
              size="small"
              aria-label="Running"
              title={{ content: "Running", placement: "left" }}
              className="text-sky-400"
            >
              <Loader2 className="animate-spin text-sky-400" />
            </LxIconButton>
          )}
          {step.status === "error" && (
            <LxIconButton
              size="small"
              aria-label="Error"
              title={{ content: "Error", placement: "left" }}
              className="text-rose-400"
            >
              <AlertCircle className="text-rose-400" />
            </LxIconButton>
          )}
          {step.status === "done" && (
            <LxIconButton
              size="small"
              aria-label="Done"
              title={{ content: "Done", placement: "left" }}
              className="text-emerald-400/80"
            >
              <CheckCircle2 className="text-emerald-400/80" />
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
                <Check className="text-emerald-400" />
              ) : (
                <Copy className="text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))]" />
              )}
            </LxIconButton>
          )}
        </div>
      </div>

      {/* question 问答面板：挂起时默认展开，完成后默认折叠；折叠时保留作答状态以支持多选。 */}
      {step.toolContent?.toolName === "question" && (
        <div
          hidden={!isExpanded}
          className="agent-execution-flow-step-body border-t border-white/5 bg-black/25 px-3 py-2.5 text-xs"
        >
          <FlowItemQuestionContent content={step.toolContent} />
        </div>
      )}

      {/* 展开详情区（question 工具的详情已内嵌展示，跳过空详情体） */}
      {effectiveExpanded && step.toolContent?.toolName !== "question" ? (
        <div
          className={`agent-execution-flow-step-body border-t px-3 py-2.5 text-xs ${bodyStyleClass}`}
        >
          {/* 系统提示词与注入详情 */}
          {step.systemContent && <FlowItemSystemContent content={step.systemContent} />}

          {/* 用户输入详情 */}
          {step.userContent && (
            <FlowItemUserContent content={step.userContent} previewRef={previewRef} />
          )}

          {/* 思考过程详情 */}
          {step.thinkingContent && (
            <FlowItemThinkingContent
              content={step.thinkingContent}
              previewRef={previewRef}
              isStreaming={isRunning}
            />
          )}

          {/* 工具调用详情 */}
          {step.toolContent && <FlowItemToolContent content={step.toolContent} />}

          {/* 子代理详情 */}
          {step.subagentContent && (
            <FlowItemSubagentContent
              content={step.subagentContent}
              onOpenSubagentItem={(subagentIndex) => onOpenSubagent?.(step.id, subagentIndex)}
            />
          )}

          {/* 上下文压缩详情 */}
          {step.compactionContent && (
            <FlowItemCompactionContent
              content={step.compactionContent}
              assistantContent={step.assistantContent}
              previewRef={previewRef}
            />
          )}

          {/* 撤销/删除详情 */}
          {step.undoContent && (
            <FlowItemUndoContent content={step.undoContent} previewRef={previewRef} />
          )}

          {/* 实施方案详情 */}
          {step.planContent && (
            <div className="agent-execution-flow-plan-content">
              <ProposedPlanCard
                plan={step.planContent}
                onAccept={onAcceptPlan}
                readOnly={!onAcceptPlan}
                hasSubsequentUserMessage={hasSubsequentUserMessage}
              />
            </div>
          )}

          {/* 代码审查详情 */}
          {step.reviewFindingsContent && (
            <div className="agent-execution-flow-review-content">
              <ReviewFindingsCard
                findingsData={step.reviewFindingsContent}
                onApplyFixes={onApplyReviewFixes}
                onFillInput={onFillInput}
                readOnly={!onApplyReviewFixes}
                hasSubsequentUserMessage={hasSubsequentUserMessage}
              />
            </div>
          )}

          {/* 前端设计原型详情 */}
          {step.frontDesignContent && (
            <div className="agent-execution-flow-design-content w-full">
              <FrontDesignCard
                design={step.frontDesignContent}
                isStreaming={step.status === "running"}
              />
            </div>
          )}

          {/* 助手回复详情 */}
          {step.assistantContent &&
            !step.compactionContent &&
            !step.planContent &&
            !step.reviewFindingsContent &&
            !step.frontDesignContent && (
              <FlowItemAssistantContent
                content={step.assistantContent}
                previewRef={previewRef}
                isStreaming={isRunning}
              />
            )}

          {/* 模型切换/初始模型详情 */}
          {step.modelSwitchContent && (
            <FlowItemModelSwitchContent content={step.modelSwitchContent} previewRef={previewRef} />
          )}

          {/* hook 运行详情（审计文本） */}
          {step.hookContent && (
            <div className="agent-execution-flow-hook-content whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[var(--color-theme-text-muted,rgba(255,255,255,0.7))]">
              {step.hookContent.text}
            </div>
          )}

          {/* 异常/中断详情 */}
          {step.errorContent && (
            <FlowItemErrorContent content={step.errorContent} fallbackTitle={step.title} />
          )}
        </div>
      ) : null}

      {/* 底部 Token 指标与并行状态栏：指标仅在步骤执行完成后展示；并行标记与 Subagent 详情不受运行态限制 */}
      {showFooter && (
        <div className="agent-execution-flow-step-footer flex items-center justify-between gap-2 overflow-hidden border-t border-white/5 px-2.5 py-1 select-none font-mono text-xs">
          {/* 左侧 Token 指标与 Subagent Detail 按钮 */}
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {showTokenMetrics && step.tokens ? (
              <LxTooltip
                placement="top"
                className="min-w-0 max-w-full"
                content={
                  <div className="flex flex-col gap-0.5 font-mono text-xs">
                    {isParallelBatchTotal && step.parallel && (
                      <div className="border-b border-white/10 pb-0.5 text-white/60">
                        {t("agent.parallelBatchTokenNotice", { total: step.parallel.total })}
                      </div>
                    )}
                    <span>Input: {(step.tokens.input ?? 0).toLocaleString()}</span>
                    <span>Output: {(step.tokens.output ?? 0).toLocaleString()}</span>
                    {step.tokens.cacheRead !== undefined && step.tokens.cacheRead > 0 && (
                      <span>Cache read: {step.tokens.cacheRead.toLocaleString()}</span>
                    )}
                  </div>
                }
              >
                <span className="inline-block min-w-0 max-w-full truncate leading-none text-white/35 select-text tabular-nums cursor-default hover:text-white/60 transition-colors">
                  <span>IN {formatTokensShort(step.tokens.input ?? 0)}</span>
                  <span aria-hidden="true" className="mx-1 opacity-40">
                    ·
                  </span>
                  <span>OUT {formatTokensShort(step.tokens.output ?? 0)}</span>
                  {step.tokens.cacheRead !== undefined && step.tokens.cacheRead > 0 && (
                    <>
                      <span aria-hidden="true" className="mx-1 opacity-40">
                        ·
                      </span>
                      <span>CACHE {formatTokensShort(step.tokens.cacheRead)}</span>
                    </>
                  )}
                  {isParallelBatchTotal && (
                    <span
                      data-testid="flow-item-parallel-token-total"
                      className="ml-1 text-xs text-white/40"
                    >
                      ({t("agent.parallelBatchTotal")})
                    </span>
                  )}
                </span>
              </LxTooltip>
            ) : null}

            {/* Token Saver 生效标注：工具步骤展示 RTK 命中，回复步骤展示风格提示词 */}
            {!isRunning && (step.tokenSaverHit || step.tokenSaver) ? (
              <FlowItemTokenSaverBadge hit={step.tokenSaverHit} run={step.tokenSaver} />
            ) : null}
          </div>

          {/* 右侧纯文字并行标记（同一批次同色，同一 turn 不同批次异色） */}
          {step.parallel && (
            <LxTooltip
              placement="top"
              className="shrink-0"
              content={t("agent.parallelToolNotice", {
                index: step.parallel.index,
                total: step.parallel.total,
              })}
            >
              <span
                data-testid="flow-item-parallel"
                className={`shrink-0 whitespace-nowrap leading-none select-none font-mono text-xs font-medium cursor-default transition-opacity hover:opacity-80 ${
                  PARALLEL_BATCH_COLORS[
                    (step.parallel.batchIndex ?? 0) % PARALLEL_BATCH_COLORS.length
                  ]
                }`}
              >
                {t("agent.parallelCall", {
                  index: step.parallel.index,
                  total: step.parallel.total,
                })}
              </span>
            </LxTooltip>
          )}
        </div>
      )}
    </div>
  )
}
