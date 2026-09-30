import { Compass, Cpu, Layers, Minimize2, RefreshCw, Undo2 } from "lucide-react"
import { Fragment } from "react"
import { FileChangesCard } from "@/features/agent/components/blocks"
import { useAgentFileReverts } from "@/features/agent/hooks/agentFileRevertStore"
import type {
  AgentUndoOption,
  ExecutionStep,
  ProposedPlanData,
  ReviewFindingItem,
} from "@/features/agent/types"
import type { FlowFileChangesEntry } from "@/features/agent/utils/fileChanges"
import { useTranslation } from "@/i18n"
import { AgentExecutionFlowGroup } from "../AgentExecutionFlowGroup"
import { AgentExecutionFlowItemMemo } from "../AgentExecutionFlowItemMemo"
import { FlowFileRevertItem } from "../FlowFileRevertItem"
import type { FilterKind, FlowRenderElement, ModelSettingsState, TurnStats } from "../types"
import { FlowTurnSummaryBar } from "./FlowTurnSummaryBar"

type FlowListElementProps = {
  element: FlowRenderElement
  actualIdx: number
  renderedFlowElements: FlowRenderElement[]
  turnStatsMap: Map<number, TurnStats>
  turnMessageIdMap: Map<number, string>
  // 该轮文件修改汇总（键为轮次；在该轮末尾统一展示）。
  fileChangesByTurn: Map<number, FlowFileChangesEntry>
  runningTurnSet: Set<number>
  hasNonGroupableAfterByIndex: boolean[]
  maxUserTurnIndex: number
  activeFilter: FilterKind
  isStreaming: boolean
  maxTurn: number
  readOnly: boolean
  canContinue: boolean
  // 当前会话 id（文件修改回退等操作定位用）。
  sessionId?: string
  isStepExpanded: (step: ExecutionStep) => boolean
  onToggleStepExpand: (step: ExecutionStep) => void
  onToggleGroupExpand: (groupId: string) => void
  isGroupExpanded: (groupId: string) => boolean
  onOpenSubagent: (stepId: string, subagentIndex?: number) => void
  onAcceptPlan?: (plan: ProposedPlanData) => void
  onApplyReviewFixes?: (selectedFindings: ReviewFindingItem[]) => void
  onFillInput?: (text: string) => void
  // 整轮撤销/删除：删除按钮菜单与 /undo 一致，回传三选一选项。
  onUndoOption?: (option: AgentUndoOption) => void
  // 可删除目标消息 id（会话最后一条助手消息；仅该轮展示删除入口）。
  deletableMessageId?: string
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
  fileChangesByTurn,
  runningTurnSet,
  hasNonGroupableAfterByIndex,
  maxUserTurnIndex,
  activeFilter,
  isStreaming,
  maxTurn,
  readOnly,
  canContinue,
  sessionId,
  isStepExpanded,
  onToggleStepExpand,
  onToggleGroupExpand,
  isGroupExpanded,
  onOpenSubagent,
  onAcceptPlan,
  onApplyReviewFixes,
  onFillInput,
  onUndoOption,
  deletableMessageId,
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

  const turnFileChanges = elementTurnIndex > 0 ? fileChangesByTurn.get(elementTurnIndex) : undefined
  // 文件回退上下文：会话与用户消息时间戳齐备时提供回退能力。
  const turnFileChangesRevert =
    sessionId && turnFileChanges?.userMessageTimestamp !== undefined
      ? { sessionId, userMessageTimestamp: turnFileChanges.userMessageTimestamp }
      : undefined
  // 该轮已回退文件标记：源轮末尾渲染"已回退"item（仅执行流展示）。
  const sessionFileReverts = useAgentFileReverts(sessionId)
  const turnFileRevertMarks =
    turnFileChanges?.userMessageTimestamp !== undefined
      ? sessionFileReverts.filter(
          (mark) => mark.userMessageTimestamp === turnFileChanges.userMessageTimestamp,
        )
      : []

  const turnMessageId = elementTurnIndex > 0 ? turnMessageIdMap.get(elementTurnIndex) : undefined
  const isTurnRunning =
    runningTurnSet.has(elementTurnIndex) || (isStreaming && elementTurnIndex === maxTurn)
  // 仅会话最后一条助手消息所在轮次可删除（不允许删除中间轮次）。
  const canDeleteTurn =
    !readOnly &&
    Boolean(onUndoOption) &&
    turnMessageId !== undefined &&
    turnMessageId === deletableMessageId &&
    !isTurnRunning

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
      {/* 协作模式切换分割线说明 */}
      {element.kind === "single" && element.step.kind === "modeSwitch" && (
        <div className="agent-execution-flow-mode-switch-divider my-1.5 flex items-center gap-2">
          <div className="h-[1px] flex-1 bg-violet-500/10" />
          <span className="font-mono text-xs font-semibold tracking-wider text-violet-300/65 uppercase flex items-center gap-1.5">
            <Compass className="h-3 w-3" />
            {t("agent.modeSwitched") || "MODE SWITCHED"}
          </span>
          <div className="h-[1px] flex-1 bg-violet-500/10" />
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

      {/* 本轮文件修改汇总：固定在该轮最后一个步骤之后展示，不随流式新步骤漂移 */}
      {isTurnEnd && turnFileChanges && (
        <div className="agent-execution-flow-file-changes mt-1.5 w-full">
          <FileChangesCard summary={turnFileChanges.summary} revertTarget={turnFileChangesRevert} />
        </div>
      )}

      {/* 本轮已回退文件 item：挂在源轮文件统计卡片之后（仅执行流展示，消息列表不渲染） */}
      {isTurnEnd && turnFileRevertMarks.length > 0 && (
        <FlowFileRevertItem marks={turnFileRevertMarks} className="mt-1.5" />
      )}

      {/* 当该 turn 结束时，在下一行左侧展示该 turn 的综合执行数据统计及删除按钮 */}
      {showTurnBottomBar && (
        <FlowTurnSummaryBar
          turnIndex={elementTurnIndex}
          turnStats={turnStats}
          canDeleteTurn={canDeleteTurn}
          onUndoOption={onUndoOption}
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
