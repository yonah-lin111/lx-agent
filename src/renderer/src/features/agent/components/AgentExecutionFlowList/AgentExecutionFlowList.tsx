import { ArrowDownToLine, ChevronUp, Workflow } from "lucide-react"
import { forwardRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useModelSettings } from "@/features/agent/hooks/modelsStore"
import { useTranslation } from "@/i18n"
import { AgentSubagentPanel } from "../panels/AgentSubagentPanel"
import { AgentExecutionFlowEmpty } from "./AgentExecutionFlowEmpty"
import { AgentExecutionFlowHeader } from "./AgentExecutionFlowHeader"
import { FlowListElement } from "./components/FlowListElement"
import { useFlowStats } from "./hooks/useFlowStats"
import { useFlowSteps } from "./hooks/useFlowSteps"
import { useFlowSubagentPanel } from "./hooks/useFlowSubagentPanel"
import { useFlowVirtualScroll } from "./hooks/useFlowVirtualScroll"
import { usePromptAssembly } from "./hooks/usePromptAssembly"
import type { AgentExecutionFlowListProps, AgentExecutionFlowListRef, FilterKind } from "./types"

/**
 * AgentExecutionFlowList - 与消息列表互斥显示的执行流程视图。
 * 只读展示当前 Agent 的全部执行日志、提示词注入与步骤；默认智能吸底，
 * 用户上翻离开底部暂停跟随，滚回底部自动恢复，发送新消息后强制回到底部。
 */
export const AgentExecutionFlowList = forwardRef<
  AgentExecutionFlowListRef,
  AgentExecutionFlowListProps
>(
  (
    {
      messages,
      isStreaming = false,
      sessionId,
      cwd,
      onSelectPrompt,
      onNavigationStateChange,
      canContinue = false,
      onContinue,
      onAcceptPlan,
      onApplyReviewFixes,
      onFillInput,
      onDeleteMessage,
      readOnly = false,
    },
    ref,
  ) => {
    const { t } = useTranslation()
    const settings = useModelSettings()
    const [activeFilter, setActiveFilter] = useState<FilterKind>("all")

    const { promptAssembly } = usePromptAssembly(sessionId, cwd)

    const {
      steps,
      maxTurn,
      filteredSteps,
      renderedFlowElements,
      hasNonGroupableAfterByIndex,
      maxUserTurnIndex,
      isStepExpanded,
      toggleStepExpanded,
      toggleGroupExpanded,
      isGroupExpanded,
    } = useFlowSteps({ messages, promptAssembly, isStreaming, activeFilter })

    const { turnStatsMap, turnMessageIdMap, runningTurnSet, stats, filterCounts } = useFlowStats({
      steps,
      isStreaming,
      maxTurn,
    })

    const {
      scrollRef,
      windowStartIndex,
      visibleElements,
      loadMoreHistory,
      handleScroll,
      scrollToBottom,
      canScrollBottom,
    } = useFlowVirtualScroll({
      ref,
      messages,
      sessionId,
      activeFilter,
      filteredSteps,
      renderedFlowElements,
      stepsCount: steps.length,
      onNavigationStateChange,
    })

    const { activeSubagentToolCall, handleOpenSubagent, handleCloseSubagent, subagentScrollRef } =
      useFlowSubagentPanel(steps)

    return (
      <div
        aria-label={t("agent.executionFlow")}
        className="agent-execution-flow-list relative flex min-h-0 min-w-0 flex-1 flex-col"
      >
        {/* 面板头部：左侧为步骤分类筛选 Tabs（有步骤时显示），右侧为统计指标浮层 */}
        <AgentExecutionFlowHeader
          stepsCount={messages.length > 0 ? steps.length : 0}
          activeFilter={activeFilter}
          filterCounts={filterCounts}
          stats={stats}
          onFilterChange={setActiveFilter}
          showStats={messages.length > 0}
        />

        {/* 步骤列表内容区 */}
        {messages.length === 0 ? (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto p-1 [scrollbar-gutter:stable]"
          >
            <AgentExecutionFlowEmpty onSelectPrompt={onSelectPrompt} className="my-auto" />
          </div>
        ) : steps.length > 0 ? (
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1 pb-16 [scrollbar-gutter:stable]"
          >
            {/* 滑动窗口：顶部存在折叠历史时，展示加载入口与未展开条数 */}
            {windowStartIndex > 0 && (
              <div className="flex w-full justify-center pt-1 pb-2">
                <button
                  type="button"
                  onClick={loadMoreHistory}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  <ChevronUp className="h-3 w-3" />
                  <span>加载更早步骤 ({windowStartIndex} 个单元未展开)</span>
                </button>
              </div>
            )}

            {filteredSteps.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {visibleElements.map((element, idx) => (
                  <FlowListElement
                    key={element.kind === "single" ? element.step.id : element.groupId}
                    element={element}
                    actualIdx={windowStartIndex + idx}
                    renderedFlowElements={renderedFlowElements}
                    turnStatsMap={turnStatsMap}
                    turnMessageIdMap={turnMessageIdMap}
                    runningTurnSet={runningTurnSet}
                    hasNonGroupableAfterByIndex={hasNonGroupableAfterByIndex}
                    maxUserTurnIndex={maxUserTurnIndex}
                    activeFilter={activeFilter}
                    isStreaming={isStreaming}
                    maxTurn={maxTurn}
                    readOnly={readOnly}
                    canContinue={canContinue}
                    isStepExpanded={isStepExpanded}
                    onToggleStepExpand={toggleStepExpanded}
                    onToggleGroupExpand={toggleGroupExpanded}
                    isGroupExpanded={isGroupExpanded}
                    onOpenSubagent={handleOpenSubagent}
                    onAcceptPlan={onAcceptPlan}
                    onApplyReviewFixes={onApplyReviewFixes}
                    onFillInput={onFillInput}
                    onDeleteMessage={onDeleteMessage}
                    onContinue={onContinue}
                    settings={settings}
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-full items-center justify-center text-xs text-white/35">
                {t("agent.noMatchingSteps")}
              </div>
            )}
          </div>
        ) : (
          /* 空状态（无步骤无消息时保底） */
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-white/40">
            <Workflow className="h-8 w-8 text-white/20" />
            <div className="text-sm font-medium text-white/60">{t("agent.noExecutionFlow")}</div>
            <div className="max-w-[240px] text-xs text-white/35">
              {t("agent.noExecutionFlowDesc")}
            </div>
          </div>
        )}

        {/* 回到底部悬浮按钮 */}
        {canScrollBottom && !activeSubagentToolCall && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
            <LxIconButton
              shape="circle"
              size="medium"
              aria-label={t("agent.scrollToBottom")}
              title={{
                content: t("agent.scrollToBottom"),
                placement: "top",
              }}
              className="pointer-events-auto border border-[var(--color-theme-border-subtle,rgba(255,255,255,0.12))] bg-[var(--color-theme-surface-elevated,#212121)] text-[var(--color-theme-text-secondary,rgba(255,255,255,0.6))] shadow-lg backdrop-blur hover:border-[var(--color-theme-border-hover,rgba(255,255,255,0.25))] hover:bg-[var(--color-theme-surface-hover,#2a2a2a)] hover:text-[var(--color-theme-text-primary,#fff)]"
              onClick={scrollToBottom}
            >
              <ArrowDownToLine />
            </LxIconButton>
          </div>
        )}

        {/* 子代理面板：点击 Subagent 步骤底部 Detail 展开，只读展示内部运行记录 */}
        <AgentSubagentPanel
          toolCall={activeSubagentToolCall}
          onClose={handleCloseSubagent}
          scrollRef={subagentScrollRef}
          mode="flow"
        />
      </div>
    )
  },
)
