import { Compass, Cpu, Layers, Minimize2, RefreshCw, Undo2 } from "lucide-react"
import { Fragment } from "react"
import type { ExecutionStep, ProposedPlanData, ReviewFindingItem } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { AgentExecutionFlowGroup } from "../AgentExecutionFlowGroup"
import { AgentExecutionFlowItemMemo } from "../AgentExecutionFlowItemMemo"
import type { FilterKind, FlowRenderElement, ModelSettingsState, TurnStats } from "../types"
import { FlowTurnSummaryBar } from "./FlowTurnSummaryBar"

type FlowListElementProps = {
  element: FlowRenderElement
  actualIdx: number
  renderedFlowElements: FlowRenderElement[]
  turnStatsMap: Map<number, TurnStats>
  turnMessageIdMap: Map<number, string>
  runningTurnSet: Set<number>
  hasNonGroupableAfterByIndex: boolean[]
  maxUserTurnIndex: number
  activeFilter: FilterKind
  isStreaming: boolean
  maxTurn: number
  readOnly: boolean
  canContinue: boolean
  isStepExpanded: (step: ExecutionStep) => boolean
  onToggleStepExpand: (step: ExecutionStep) => void
  onToggleGroupExpand: (groupId: string) => void
  isGroupExpanded: (groupId: string) => boolean
  onOpenSubagent: (stepId: string, subagentIndex?: number) => void
  onAcceptPlan?: (plan: ProposedPlanData) => void
  onApplyReviewFixes?: (selectedFindings: ReviewFindingItem[]) => void
  onFillInput?: (text: string) => void
  onDeleteMessage?: (messageId: string) => void
  onContinue?: () => void
  settings: ModelSettingsState
}

/**
 * 渲染单个执行流元素：分割线、步骤/折叠组、轮次汇总与继续生成入口。
 */
export const FlowListElement = ({
  element,
  actualIdx,
  renderedFlowElements,
  turnStatsMap,
  turnMessageIdMap,
  runningTurnSet,
  hasNonGroupableAfterByIndex,
  maxUserTurnIndex,
  activeFilter,
  isStreaming,
  maxTurn,
  readOnly,
  canContinue,
  isStepExpanded,
  onToggleStepExpand,
  onToggleGroupExpand,
  isGroupExpanded,
  onOpenSubagent,
  onAcceptPlan,
  onApplyReviewFixes,
  onFillInput,
  onDeleteMessage,
  onContinue,
  settings,
}: FlowListElementProps): React.JSX.Element => {
  const { t } = useTranslation()

  const prevElement = renderedFlowElements[actualIdx - 1]
  const nextElement = renderedFlowElements[actualIdx + 1]

  const elementTurnIndex = element.kind === "single" ? element.step.turnIndex : element.turnIndex
  const prevTurnIndex = prevElement
    ? prevElement.kind === "single"
      ? prevElement.step.turnIndex
      : prevElement.turnIndex
    : -1
  const nextTurnIndex = nextElement
    ? nextElement.kind === "single"
      ? nextElement.step.turnIndex
      : nextElement.turnIndex
    : -1

  const isNewTurn = !prevElement || prevTurnIndex !== elementTurnIndex
  const isTurnEnd = !nextElement || nextTurnIndex !== elementTurnIndex
  const isSystemStart =
    element.kind === "single" &&
    element.step.kind === "system" &&
    (!prevElement ||
      (prevElement.kind === "single" && prevElement.step.kind !== "system") ||
      prevElement.kind === "group")

  const turnStats = elementTurnIndex > 0 ? turnStatsMap.get(elementTurnIndex) : undefined

  const turnMessageId = elementTurnIndex > 0 ? turnMessageIdMap.get(elementTurnIndex) : undefined
  const isTurnRunning =
    runningTurnSet.has(elementTurnIndex) || (isStreaming && elementTurnIndex === maxTurn)
  const canDeleteTurn =
    !readOnly && Boolean(onDeleteMessage) && Boolean(turnMessageId) && !isTurnRunning

  const hasTurnSummaryPills =
    turnStats &&
    turnStats.isCompleted &&
    (Boolean(turnStats.model) ||
      turnStats.toolCallsCount > 0 ||
      turnStats.inputTokens > 0 ||
      turnStats.outputTokens > 0 ||
      turnStats.durationMs > 0)

  const showTurnBottomBar =
    isTurnEnd &&
    elementTurnIndex > 0 &&
    (activeFilter === "all" || activeFilter === "assistant") &&
    (canDeleteTurn || hasTurnSummaryPills)

  const isGroupStreamingActive =
    isStreaming &&
    element.kind === "group" &&
    element.turnIndex === maxTurn &&
    !hasNonGroupableAfterByIndex[actualIdx]

  return (
    <Fragment>
      {/* 轮次分隔线（仅非 compaction / 非 modelSwitch / 非 undo 的用户交互轮次展示） */}
      {isNewTurn && elementTurnIndex > 0 && (
        <div className="agent-execution-flow-turn-divider my-1.5 flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-purple-500/10" />
          <span className="font-mono text-xs font-semibold tracking-wider text-purple-300/65 uppercase flex items-center gap-1.5">
            <Layers className="h-3 w-3" />
            {t("agent.turnLabel", { turn: elementTurnIndex })}
          </span>
          <div className="h-[1px] flex-1 bg-purple-500/10" />
        </div>
      )}
      {/* 撤销独立分割线 */}
      {element.kind === "single" && element.step.kind === "undo" && (
        <div className="agent-execution-flow-undo-divider my-1.5 flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-rose-500/10" />
          <span className="font-mono text-xs font-semibold tracking-wider text-rose-300/65 uppercase flex items-center gap-1.5">
            <Undo2 className="h-3 w-3" />
            {t("agent.undoSummary")}
          </span>
          <div className="h-[1px] flex-1 bg-rose-500/10" />
        </div>
      )}
      {/* 上下文压缩分割线说明 */}
      {element.kind === "single" && element.step.kind === "compaction" && (
        <div className="agent-execution-flow-compaction-divider my-1.5 flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-indigo-500/10" />
          <span className="font-mono text-xs font-semibold tracking-wider text-indigo-300/65 uppercase flex items-center gap-1.5">
            <Minimize2 className="h-3 w-3" />
            {t("settings.contextCompaction")}
          </span>
          <div className="h-[1px] flex-1 bg-indigo-500/10" />
        </div>
      )}
      {/* 模型切换/初始模型分割线说明 */}
      {element.kind === "single" && element.step.kind === "modelSwitch" && (
        <div className="agent-execution-flow-model-switch-divider my-1.5 flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-cyan-500/10" />
          <span className="font-mono text-xs font-semibold tracking-wider text-cyan-300/65 uppercase flex items-center gap-1.5">
            <Cpu className="h-3 w-3" />
            {element.step.modelSwitchContent?.isInitial
              ? t("agent.initialModel") || "INITIAL MODEL"
              : t("agent.modelSwitched") || "MODEL SWITCHED"}
          </span>
          <div className="h-[1px] flex-1 bg-cyan-500/10" />
        </div>
      )}
      {/* System 分割线 */}
      {isSystemStart && (
        <div className="agent-execution-flow-system-divider my-1.5 flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-slate-500/10" />
          <span className="font-mono text-xs font-semibold tracking-wider text-slate-400/65 uppercase flex items-center gap-1.5">
            <Compass className="h-3 w-3" />
            {t("agent.systemPrompt")}
          </span>
          <div className="h-[1px] flex-1 bg-slate-500/10" />
        </div>
      )}

      {/* 渲染单个 Step 或 Group */}
      {element.kind === "single" ? (
        <AgentExecutionFlowItemMemo
          step={element.step}
          isExpanded={isStepExpanded(element.step)}
          onToggleExpand={() => onToggleStepExpand(element.step)}
          onOpenSubagent={onOpenSubagent}
          onAcceptPlan={onAcceptPlan}
          onApplyReviewFixes={onApplyReviewFixes}
          onFillInput={onFillInput}
          hasSubsequentUserMessage={element.step.turnIndex < maxUserTurnIndex}
        />
      ) : (
        <AgentExecutionFlowGroup
          groupId={element.groupId}
          steps={element.steps}
          isExpanded={isGroupExpanded(element.groupId)}
          onToggleExpand={() => onToggleGroupExpand(element.groupId)}
          isStepExpanded={isStepExpanded}
          onToggleStepExpand={onToggleStepExpand}
          onOpenSubagent={onOpenSubagent}
          isStreamingActive={isGroupStreamingActive}
        />
      )}

      {/* 当该 turn 结束时，在下一行左侧展示该 turn 的综合执行数据统计及删除按钮 */}
      {showTurnBottomBar && (
        <FlowTurnSummaryBar
          turnIndex={elementTurnIndex}
          turnStats={turnStats}
          turnMessageId={turnMessageId}
          canDeleteTurn={canDeleteTurn}
          onDeleteMessage={onDeleteMessage}
          settings={settings}
        />
      )}

      {/* 最后一轮被截断/中止时展示"继续生成"操作按钮 */}
      {isTurnEnd && elementTurnIndex === maxTurn && canContinue && onContinue && (
        <div className="agent-execution-flow-continue-container mt-1 mb-1.5 flex pl-1">
          <button
            type="button"
            onClick={onContinue}
            className="agent-execution-flow-continue-btn flex w-fit items-center gap-1 rounded-[6px] border border-white/10 px-2 py-1 text-xs text-white/65 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("agent.continueGenerating")}
          </button>
        </div>
      )}
    </Fragment>
  )
}
