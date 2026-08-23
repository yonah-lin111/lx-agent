import type { PromptAssembly } from "@shared/contracts/agent"
import { Workflow } from "lucide-react"
import type React from "react"
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentEmptyHero } from "@/features/agent/components/AgentEmptyHero"
import { AgentSuggestedPromptCards } from "@/features/agent/components/AgentSuggestedPromptCards"
import { buildExecutionSteps } from "@/features/agent/executionFlow"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { AgentExecutionFlowHeader } from "./AgentExecutionFlowHeader"
import { AgentExecutionFlowItem } from "./AgentExecutionFlowItem"
import type { ExecutionFlowStats, FilterKind } from "./types"

export interface AgentExecutionFlowListProps {
  // 当前会话的全部消息列表
  messages: readonly ChatMessage[]
  // 当前会话 ID（用于查询完整装配的系统提示词）
  sessionId?: string
  // 当前项目或工作区路径
  cwd?: string
  // 点击推荐提示词回调
  onSelectPrompt?: (prompt: string) => void
}

// 智能吸底判定阈值：滚动容器距底部小于该值视为处于底部。
const FOLLOW_BOTTOM_THRESHOLD = 40

/**
 * AgentExecutionFlowList - 与消息列表互斥显示的执行流程视图。
 * 只读展示当前 Agent 的全部执行日志、提示词注入与步骤；默认智能吸底，
 * 用户上翻离开底部暂停跟随，滚回底部自动恢复，发送新消息后强制回到底部。
 */
export const AgentExecutionFlowList = ({
  messages,
  sessionId,
  cwd,
  onSelectPrompt,
}: AgentExecutionFlowListProps): React.JSX.Element => {
  const { t } = useTranslation()

  // 滚动容器引用
  const scrollRef = useRef<HTMLDivElement>(null)

  // 智能吸底：默认跟随底部；用户上翻离开底部暂停跟随，滚回底部自动恢复。
  const followBottomRef = useRef(true)
  const prevScrollTopRef = useRef<number | null>(null)

  const [promptAssembly, setPromptAssembly] = useState<PromptAssembly | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKind>("all")
  // 手动展开/折叠覆盖状态字典：用户手动点击过的步骤在此记录覆盖值
  const [userExpansionOverrides, setUserExpansionOverrides] = useState<Record<string, boolean>>({})

  // 获取完整系统提示词装配
  const fetchPromptAssembly = useCallback(async () => {
    try {
      const assembly = await agentApi.getPromptAssembly(sessionId, cwd)
      setPromptAssembly(assembly)
    } catch {
      setPromptAssembly(null)
    }
  }, [sessionId, cwd])

  // 挂载时获取系统提示词装配
  useEffect(() => {
    void fetchPromptAssembly()
  }, [fetchPromptAssembly])

  // 提取步骤列表：直接由实时 messages 响应式计算，AI 生成输出中实时跟进新步骤与流式内容
  const steps = useMemo(
    () => buildExecutionSteps(messages, promptAssembly),
    [messages, promptAssembly],
  )

  // 计算最大轮次（最后一轮）
  const maxTurn = useMemo(() => {
    let max = 0
    for (const step of steps) {
      if (step.turnIndex > max) {
        max = step.turnIndex
      }
    }
    return max
  }, [steps])

  // 计算某个步骤当前的展开状态（用户手动覆盖 > 默认展开规则）
  const isStepExpanded = useCallback(
    (step: ExecutionStep): boolean => {
      if (step.id in userExpansionOverrides) {
        return userExpansionOverrides[step.id]
      }
      // 默认规则：用户 item 始终默认展开；异常/中断 item 默认展开；最后一轮的 assistant item 默认展开；其余默认折叠
      if (step.kind === "user" || step.kind === "error") {
        return true
      }
      if (step.kind === "assistant") {
        return step.turnIndex === maxTurn && maxTurn > 0
      }
      return false
    },
    [userExpansionOverrides, maxTurn],
  )

  // 切换指定步骤的展开/折叠状态并记录手动覆盖
  const toggleStepExpanded = useCallback(
    (step: ExecutionStep) => {
      const currentExpanded = isStepExpanded(step)
      setUserExpansionOverrides((prev) => ({
        ...prev,
        [step.id]: !currentExpanded,
      }))
    },
    [isStepExpanded],
  )

  // 过滤后的步骤列表
  const filteredSteps = useMemo(() => {
    if (activeFilter === "all") return steps
    return steps.filter((step) => step.kind === activeFilter)
  }, [steps, activeFilter])

  // 滚动时更新跟随状态：向上滚动离开底部暂停吸底，向下滚回底部自动恢复。
  const handleScroll = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const prevScrollTop = prevScrollTopRef.current
    const isScrollingUp = prevScrollTop !== null && prevScrollTop - el.scrollTop > 0.5
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_BOTTOM_THRESHOLD
    followBottomRef.current = isScrollingUp ? false : nearBottom
    prevScrollTopRef.current = el.scrollTop
  }, [])

  // 记录上一轮消息数量，用于检测用户发送新消息或收到新消息
  const prevMessagesLengthRef = useRef(messages.length)

  // 用户发送新消息后强制滚动到底部并恢复跟随
  useEffect(() => {
    const prevLength = prevMessagesLengthRef.current
    prevMessagesLengthRef.current = messages.length

    if (messages.length <= prevLength) return
    followBottomRef.current = true
    const el = scrollRef.current
    if (el) {
      if (typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
      } else {
        el.scrollTop = el.scrollHeight
      }
    }
  }, [messages.length])

  // AI 实时输出生成、步骤更新时，处于跟随状态则持续保持在底部
  useLayoutEffect(() => {
    if (!followBottomRef.current) return
    const el = scrollRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
    }
  }, [filteredSteps])

  // 统计指标汇总
  const stats = useMemo<ExecutionFlowStats>(() => {
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
  const filterCounts = useMemo<Record<FilterKind, number>>(() => {
    const counts: Record<FilterKind, number> = {
      all: steps.length,
      system: 0,
      user: 0,
      thinking: 0,
      tool: 0,
      subagent: 0,
      compaction: 0,
      assistant: 0,
      error: 0,
    }
    for (const step of steps) {
      counts[step.kind]++
    }
    return counts
  }, [steps])

  return (
    <div
      aria-label={t("agent.executionFlow")}
      className="agent-execution-flow-list relative flex min-h-0 min-w-0 flex-1 flex-col"
    >
      {/* 面板头部：左侧为步骤分类筛选 Tabs（有步骤时显示），右侧为统计指标浮层 */}
      <AgentExecutionFlowHeader
        stepsCount={steps.length}
        activeFilter={activeFilter}
        filterCounts={filterCounts}
        stats={stats}
        onFilterChange={setActiveFilter}
      />

      {/* 步骤列表内容区 */}
      {messages.length === 0 ? (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-3 py-2 [scrollbar-gutter:stable]"
        >
          {/* 系统提示词步骤项（有系统提示词装配时展示） */}
          {filteredSteps.length > 0 && (
            <div className="flex shrink-0 flex-col gap-1.5">
              {filteredSteps.map((step) => (
                <AgentExecutionFlowItem
                  key={step.id}
                  step={step}
                  isExpanded={isStepExpanded(step)}
                  onToggleExpand={() => toggleStepExpanded(step)}
                />
              ))}
            </div>
          )}

          {/* 空状态品牌与当前模式说明 */}
          <AgentEmptyHero mode="flow" className="my-auto py-6" />

          {/* 推荐问题 */}
          {onSelectPrompt && (
            <div className="mt-auto mb-1 shrink-0">
              <AgentSuggestedPromptCards onSelectPrompt={onSelectPrompt} />
            </div>
          )}
        </div>
      ) : steps.length > 0 ? (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
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
                    {/* 上下文压缩分割线说明 */}
                    {step.kind === "compaction" && (
                      <div className="agent-execution-flow-compaction-divider my-1.5 flex items-center gap-2">
                        <div className="h-[1px] flex-1 bg-white/10" />
                        <span className="font-mono text-[10px] font-semibold tracking-wider text-indigo-300/60 uppercase">
                          {t("settings.contextCompaction")}
                        </span>
                        <div className="h-[1px] flex-1 bg-white/10" />
                      </div>
                    )}
                    <AgentExecutionFlowItem
                      step={step}
                      isExpanded={isStepExpanded(step)}
                      onToggleExpand={() => toggleStepExpanded(step)}
                    />
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
        /* 空状态（无步骤无消息时保底） */
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
