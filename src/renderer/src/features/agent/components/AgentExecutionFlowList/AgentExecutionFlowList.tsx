import type { PromptAssembly } from "@shared/contracts/agent"
import { ChevronUp, Loader2, Workflow } from "lucide-react"
import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { agentApi } from "@/features/agent/api/agentApi"
import { AgentEmptyHero } from "@/features/agent/components/AgentEmptyHero"
import { AgentSuggestedPromptCards } from "@/features/agent/components/AgentSuggestedPromptCards"
import { buildExecutionSteps } from "@/features/agent/executionFlow"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { AgentExecutionFlowGroup } from "./AgentExecutionFlowGroup"
import { AgentExecutionFlowHeader } from "./AgentExecutionFlowHeader"
import { AgentExecutionFlowItem } from "./AgentExecutionFlowItem"
import {
  type ExecutionFlowStats,
  type FilterKind,
  formatDurationMs,
  formatTokenCount,
  type TurnStats,
} from "./types"

export interface AgentExecutionFlowListProps {
  // 当前会话的全部消息列表
  messages: readonly ChatMessage[]
  // 是否正在流式生成/运行中
  isStreaming?: boolean
  // 当前会话 ID（用于查询完整装配的系统提示词）
  sessionId?: string
  // 当前项目或工作区路径
  cwd?: string
  // 点击推荐提示词回调
  onSelectPrompt?: (prompt: string) => void
  // 导航状态变化回调（驱动输入区上一个/下一个/回到底部按钮可用性）
  onNavigationStateChange?: (state: AgentFlowNavState) => void
}

// 输入区导航按钮状态。
export interface AgentFlowNavState {
  canScrollBottom: boolean
}

// 执行流程列表命令式句柄：供输入区回到底部按钮调用。
export interface AgentExecutionFlowListRef {
  scrollToBottom: () => void
}

// 智能吸底判定阈值：滚动容器距底部小于该值视为处于底部。
const FOLLOW_BOTTOM_THRESHOLD = 40
// 触顶加载更多历史阈值。
const LOAD_MORE_TOP_THRESHOLD = 150
// 初始滑动窗口大小：默认展示最新的 15 个执行元素（含单步与折叠组）。
const WINDOW_INITIAL_SIZE = 15
// 向上滚动触发加载时，每次追加的历史元素数。
const WINDOW_PAGE_SIZE = 15

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
    { messages, isStreaming = false, sessionId, cwd, onSelectPrompt, onNavigationStateChange },
    ref,
  ) => {
    const { t } = useTranslation()

    // 滚动容器引用
    const scrollRef = useRef<HTMLDivElement>(null)

    // 滚动跟随：仅在滚动条位于底部时跟随；用户向上滚动离开底部暂停跟随，滚回底部恢复跟随。
    const followBottomRef = useRef(true)
    const prevScrollTopRef = useRef<number | null>(null)
    const hasInitialScrolledRef = useRef(false)

    const [promptAssembly, setPromptAssembly] = useState<PromptAssembly | null>(null)
    const [activeFilter, setActiveFilter] = useState<FilterKind>("all")
    // 手动展开/折叠覆盖状态字典：用户手动点击过的步骤或 Group 在此记录覆盖值
    const [userExpansionOverrides, setUserExpansionOverrides] = useState<Record<string, boolean>>(
      {},
    )
    const [groupExpansionOverrides, setGroupExpansionOverrides] = useState<Record<string, boolean>>(
      {},
    )
    const pendingQuestionStepIdsRef = useRef(new Set<string>())

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

    // 会话切换时重置初始吸底标记
    useEffect(() => {
      hasInitialScrolledRef.current = false
      followBottomRef.current = true
      prevScrollTopRef.current = null
    }, [sessionId])

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

    // 获取最后一个 turn（maxTurn）的最后一个步骤 ID（仅在 AI 输出完成即 !isStreaming 时才默认展开）
    const lastStepOfMaxTurnId = useMemo(() => {
      if (isStreaming || maxTurn <= 0) return null
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].turnIndex === maxTurn) {
          return steps[i].id
        }
      }
      return null
    }, [steps, maxTurn, isStreaming])

    // 计算某个步骤当前的展开状态（用户手动覆盖 > 默认展开规则）
    const isStepExpanded = useCallback(
      (step: ExecutionStep): boolean => {
        if (step.id in userExpansionOverrides) {
          return userExpansionOverrides[step.id]
        }
        if (step.toolContent?.toolName === "question") {
          return step.toolContent.question !== undefined
        }
        // 默认规则：全部用户 item 默认展开；异常/中断 item 默认展开；最后一个 turn 的最后一个 step（非流式）默认展开；其余全部折叠
        if (step.kind === "user" || step.kind === "error") {
          return true
        }
        if (step.id === lastStepOfMaxTurnId) {
          return true
        }
        return false
      },
      [userExpansionOverrides, lastStepOfMaxTurnId],
    )

    // question 完成后清除其手动展开覆盖，恢复完成态默认折叠；历史 question 仍可由用户再次展开查看。
    useLayoutEffect(() => {
      const pendingQuestionStepIds = new Set(
        steps
          .filter((step) => step.toolContent?.toolName === "question" && step.toolContent.question)
          .map((step) => step.id),
      )

      setUserExpansionOverrides((prev) => {
        let next: Record<string, boolean> | undefined
        for (const id of pendingQuestionStepIdsRef.current) {
          if (!pendingQuestionStepIds.has(id) && id in prev) {
            next ??= { ...prev }
            delete next[id]
          }
        }
        return next ?? prev
      })
      pendingQuestionStepIdsRef.current = pendingQuestionStepIds
    }, [steps])

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

    // 切换 Group 展开/折叠状态
    const toggleGroupExpanded = useCallback((groupId: string) => {
      setGroupExpansionOverrides((prev) => ({
        ...prev,
        [groupId]: !prev[groupId],
      }))
    }, [])

    // 判断 step 是否属于可折叠进 group 的类别（检索工具/其他工具/思考/系统；排除 ai、用户输入、压缩、todo、question、可视化工具 render_svg/render_ascii/render_html 以及写操作 edit/write/apply_patch）
    const isGroupableStep = useCallback((step: ExecutionStep): boolean => {
      if (
        step.kind === "assistant" ||
        step.kind === "user" ||
        step.kind === "compaction" ||
        step.kind === "error"
      ) {
        return false
      }
      const toolName = step.toolContent?.toolName
      if (
        toolName === "todowrite" ||
        toolName === "question" ||
        toolName === "write" ||
        toolName === "edit" ||
        toolName === "apply_patch" ||
        toolName === "render_svg" ||
        toolName === "render_ascii" ||
        toolName === "render_html"
      ) {
        return false
      }
      return true
    }, [])

    // 过滤后的步骤列表
    const filteredSteps = useMemo(() => {
      if (activeFilter === "all") return steps
      return steps.filter((step) => step.kind === activeFilter)
    }, [steps, activeFilter])

    // 按轮次与非聚合项将 filteredSteps 切分为 items / groups
    const renderedFlowElements = useMemo(() => {
      if (activeFilter !== "all") {
        return filteredSteps.map((step) => ({
          kind: "single" as const,
          step,
        }))
      }

      type RenderElement =
        | { kind: "single"; step: ExecutionStep }
        | { kind: "group"; groupId: string; steps: ExecutionStep[]; turnIndex: number }

      const elements: RenderElement[] = []
      let currentGroupSteps: ExecutionStep[] = []
      let currentGroupTurn: number = -1

      const flushGroup = () => {
        if (currentGroupSteps.length === 0) return
        if (currentGroupSteps.length === 1) {
          elements.push({ kind: "single", step: currentGroupSteps[0] })
        } else {
          const groupId = `flow-group-${currentGroupSteps[0].id}-${currentGroupSteps[currentGroupSteps.length - 1].id}`
          elements.push({
            kind: "group",
            groupId,
            steps: [...currentGroupSteps],
            turnIndex: currentGroupTurn,
          })
        }
        currentGroupSteps = []
        currentGroupTurn = -1
      }

      for (const step of filteredSteps) {
        if (isGroupableStep(step)) {
          if (currentGroupSteps.length > 0 && currentGroupTurn !== step.turnIndex) {
            flushGroup()
          }
          currentGroupTurn = step.turnIndex
          currentGroupSteps.push(step)
        } else {
          flushGroup()
          elements.push({ kind: "single", step })
        }
      }
      flushGroup()

      return elements
    }, [filteredSteps, activeFilter, isGroupableStep])

    // --- Sliding Window (滑动窗口) ---
    // 窗口起始索引：从该索引到末尾的 elements 实际渲染到 DOM 中。
    const [windowStartIndex, setWindowStartIndex] = useState<number>(() =>
      Math.max(0, renderedFlowElements.length - WINDOW_INITIAL_SIZE),
    )

    // 记录滚动位置与高度，供上滑追加历史后做滚动高度差补偿。
    const scrollCompensationRef = useRef<{
      prevScrollHeight: number
      prevScrollTop: number
    } | null>(null)

    // 会话切换（消息列表重置或恢复）或筛选切换时，重置滑动窗口与初次吸底标记。
    const prevMessagesLengthRef = useRef(messages.length)
    const prevActiveFilterRef = useRef(activeFilter)
    useEffect(() => {
      const isFilterChanged = prevActiveFilterRef.current !== activeFilter
      prevActiveFilterRef.current = activeFilter

      if (
        isFilterChanged ||
        messages.length === 0 ||
        Math.abs(messages.length - prevMessagesLengthRef.current) > 5
      ) {
        setWindowStartIndex(Math.max(0, renderedFlowElements.length - WINDOW_INITIAL_SIZE))
        hasInitialScrolledRef.current = false
      }
      prevMessagesLengthRef.current = messages.length
    }, [messages.length, activeFilter, renderedFlowElements.length])

    // 当前切片内的可见 elements
    const visibleElements = useMemo(
      () => renderedFlowElements.slice(windowStartIndex),
      [renderedFlowElements, windowStartIndex],
    )

    // 向上加载更多历史：扩展窗口起始索引，并在渲染后无缝补偿滚动位置。
    const loadMoreHistory = useCallback((): void => {
      if (windowStartIndex <= 0) return
      const el = scrollRef.current
      if (el) {
        scrollCompensationRef.current = {
          prevScrollHeight: el.scrollHeight,
          prevScrollTop: el.scrollTop,
        }
      }
      setWindowStartIndex((prev) => Math.max(0, prev - WINDOW_PAGE_SIZE))
    }, [windowStartIndex])

    // 上滑追加历史后，立即做滚动高度差补偿，确保当前视野内容完全静止、无任何跳跃。
    useLayoutEffect(() => {
      const compensation = scrollCompensationRef.current
      if (!compensation) return
      const el = scrollRef.current
      if (el) {
        const heightDiff = el.scrollHeight - compensation.prevScrollHeight
        el.scrollTop = compensation.prevScrollTop + heightDiff
      }
      scrollCompensationRef.current = null
    }, [visibleElements])

    // 运行中的虚拟占位步骤（只要处于流式输出中，且当前筛选允许显示助手/全部，就始终展示 loading 占位）
    const showSkeletonLoading =
      isStreaming && (activeFilter === "all" || activeFilter === "assistant")

    const scrollToBottom = useCallback((): void => {
      const el = scrollRef.current
      if (!el) return
      followBottomRef.current = true
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }, [])

    const isNearBottom = useCallback((): boolean => {
      const el = scrollRef.current
      if (!el) return true
      return el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_BOTTOM_THRESHOLD
    }, [])

    // 计算导航按钮可用性（基于吸底状态）。
    const computeNavState = useCallback((): AgentFlowNavState => {
      const el = scrollRef.current
      if (!el || steps.length === 0) {
        return { canScrollBottom: false }
      }
      return {
        canScrollBottom: !isNearBottom(),
      }
    }, [isNearBottom, steps.length])

    const updateNavState = useCallback((): void => {
      onNavigationStateChange?.(computeNavState())
    }, [computeNavState, onNavigationStateChange])

    // 滚动时更新跟随状态：向上滚动离开底部暂停跟随，向下滚回底部自动恢复。
    const handleScroll = useCallback((): void => {
      const el = scrollRef.current
      if (!el || el.clientHeight <= 0) return
      const nearBottom = isNearBottom()
      const prevScrollTop = prevScrollTopRef.current
      const isScrollingUp = prevScrollTop !== null && prevScrollTop - el.scrollTop > 0.5
      if (isScrollingUp) {
        followBottomRef.current = false
      } else {
        followBottomRef.current = nearBottom
      }
      prevScrollTopRef.current = el.scrollTop
      updateNavState()

      // 向上滑动接近顶部时，自动拉取上一页历史并无感补偿滚动。
      if (el.scrollTop < LOAD_MORE_TOP_THRESHOLD && windowStartIndex > 0) {
        loadMoreHistory()
      }
    }, [isNearBottom, loadMoreHistory, updateNavState, windowStartIndex])

    // 新建或清空对话后复位滚动状态
    useEffect(() => {
      if (messages.length !== 0) return
      hasInitialScrolledRef.current = false
      followBottomRef.current = true
      prevScrollTopRef.current = null
      updateNavState()
    }, [messages.length, updateNavState])

    // 用户发送新消息后平滑滚动到底部
    const prevMessagesRef = useRef<readonly ChatMessage[]>(messages)
    useEffect(() => {
      const prev = prevMessagesRef.current
      prevMessagesRef.current = messages

      if (
        !messages
          .slice(prev.length)
          .some((message) => message.role === "user" && !message.isQueuedDrain)
      ) {
        return
      }

      followBottomRef.current = true
      const el = scrollRef.current
      if (el) {
        if (typeof el.scrollTo === "function") {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
        } else {
          el.scrollTop = el.scrollHeight
        }
      }
    }, [messages])

    // 首次进入吸底；AI 实时输出生成、步骤更新时，处于跟随状态则持续保持在底部
    useLayoutEffect(() => {
      const el = scrollRef.current
      if (!el || el.clientHeight <= 0) return

      if (!hasInitialScrolledRef.current && filteredSteps.length > 0) {
        el.scrollTop = el.scrollHeight
        hasInitialScrolledRef.current = true
        updateNavState()
        return
      }

      if (followBottomRef.current) {
        el.scrollTop = el.scrollHeight
      }
      updateNavState()
    }, [filteredSteps, showSkeletonLoading, updateNavState])

    // 暴露命令式句柄（回到底部）。
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
      }),
      [scrollToBottom],
    )

    // 每轮执行指标汇总（计算每轮的模型、工具数、token、缓存命中、耗时及是否已完成）
    const turnStatsMap = useMemo<Map<number, TurnStats>>(() => {
      const map = new Map<
        number,
        TurnStats & {
          firstTimestamp?: number
          lastTimestamp?: number
          lastStepDurationMs?: number
          sumStepDurationMs: number
        }
      >()

      for (const step of steps) {
        if (step.turnIndex <= 0) continue

        let current = map.get(step.turnIndex)
        if (!current) {
          current = {
            turn: step.turnIndex,
            model: step.model,
            toolCallsCount: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            durationMs: 0,
            isCompleted: true,
            sumStepDurationMs: 0,
          }
          map.set(step.turnIndex, current)
        }

        if (step.model && !current.model) {
          current.model = step.model
        }

        if (step.status === "running") {
          current.isCompleted = false
        }

        if (step.kind === "tool" || step.kind === "subagent") {
          current.toolCallsCount++
        }

        if (step.durationMs !== undefined) {
          current.sumStepDurationMs += step.durationMs
        }

        if (step.timestamp !== undefined) {
          if (current.firstTimestamp === undefined) {
            current.firstTimestamp = step.timestamp
          }
          current.lastTimestamp = step.timestamp
          current.lastStepDurationMs = step.durationMs
        }

        if (step.tokens) {
          if (step.tokens.input) current.inputTokens += step.tokens.input
          if (step.tokens.output) current.outputTokens += step.tokens.output
          if (step.tokens.cacheRead) current.cacheReadTokens += step.tokens.cacheRead
          if (step.tokens.total) current.totalTokens += step.tokens.total
        }
      }

      // 计算每个 turn 的端到端真实运行时间（优先基于首尾时间戳跨度计算）
      for (const current of map.values()) {
        if (
          current.firstTimestamp !== undefined &&
          current.lastTimestamp !== undefined &&
          current.lastTimestamp >= current.firstTimestamp
        ) {
          const span =
            current.lastTimestamp -
            current.firstTimestamp +
            (current.lastStepDurationMs !== undefined && current.lastStepDurationMs > 0
              ? current.lastStepDurationMs
              : 0)
          current.durationMs = span > 0 ? span : current.sumStepDurationMs
        } else {
          current.durationMs = current.sumStepDurationMs
        }
      }

      // 若当前为最后一轮且 isStreaming 为 true，则最后一轮未完成
      if (isStreaming && maxTurn > 0) {
        const lastTurnStat = map.get(maxTurn)
        if (lastTurnStat) {
          lastTurnStat.isCompleted = false
        }
      }

      return map
    }, [steps, isStreaming, maxTurn])

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

    // 计算每个step对应的turn起始索引
    const stepTurnStartIndices = useMemo(() => {
      const map = new Map<string, number>()
      let currentTurn = -1
      let turnStartIndex = 0
      for (const step of filteredSteps) {
        if (step.turnIndex !== currentTurn) {
          currentTurn = step.turnIndex
          turnStartIndex = step.stepIndex
        }
        map.set(step.id, turnStartIndex)
      }
      return map
    }, [filteredSteps])

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
            className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto px-3 py-2 [scrollbar-gutter:stable]"
          >
            {/* 非空列表时展示步骤项 */}
            {messages.length > 0 && filteredSteps.length > 0 && (
              <div className="flex shrink-0 flex-col gap-1.5">
                {filteredSteps.map((step) => (
                  <AgentExecutionFlowItem
                    key={step.id}
                    step={step}
                    isExpanded={isStepExpanded(step)}
                    onToggleExpand={() => toggleStepExpanded(step)}
                    turnStartIndex={stepTurnStartIndices.get(step.id) ?? step.stepIndex}
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
            className="custom-scrollbar min-h-0 flex-1 overflow-y-scroll px-3 py-2 pb-16 [scrollbar-gutter:stable]"
          >
            {/* 滑动窗口：顶部存在折叠历史时，展示加载入口与未展开条数 */}
            {windowStartIndex > 0 && (
              <div className="flex w-full justify-center pt-1 pb-2">
                <button
                  type="button"
                  onClick={loadMoreHistory}
                  className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                >
                  <ChevronUp className="h-3 w-3" />
                  <span>加载更早步骤 ({windowStartIndex} 个单元未展开)</span>
                </button>
              </div>
            )}

            {filteredSteps.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {visibleElements.map((element, idx) => {
                  const actualIdx = windowStartIndex + idx
                  const prevElement = renderedFlowElements[actualIdx - 1]
                  const nextElement = renderedFlowElements[actualIdx + 1]

                  const elementTurnIndex =
                    element.kind === "single"
                      ? element.step.turnIndex
                      : element.turnIndex
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

                  const turnStats =
                    elementTurnIndex > 0 ? turnStatsMap.get(elementTurnIndex) : undefined

                  return (
                    <Fragment key={element.kind === "single" ? element.step.id : element.groupId}>
                      {/* 轮次分隔线 */}
                      {isNewTurn && elementTurnIndex > 0 && (
                        <div className="agent-execution-flow-turn-divider my-1.5 flex items-center gap-2">
                          <div className="h-[1px] flex-1 bg-white/10" />
                          <span className="font-mono text-[10px] font-semibold tracking-wider text-white/35 uppercase">
                            {t("agent.turnLabel", { turn: elementTurnIndex })}
                          </span>
                          <div className="h-[1px] flex-1 bg-white/10" />
                        </div>
                      )}
                      {/* 上下文压缩分割线说明 */}
                      {element.kind === "single" && element.step.kind === "compaction" && (
                        <div className="agent-execution-flow-compaction-divider my-1.5 flex items-center gap-2">
                          <div className="h-[1px] flex-1 bg-white/10" />
                          <span className="font-mono text-[10px] font-semibold tracking-wider text-indigo-300/60 uppercase">
                            {t("settings.contextCompaction")}
                          </span>
                          <div className="h-[1px] flex-1 bg-white/10" />
                        </div>
                      )}
                      {/* System 分割线 */}
                      {isSystemStart && (
                        <div className="agent-execution-flow-system-divider my-1.5 flex items-center gap-2">
                          <div className="h-[1px] flex-1 bg-white/10" />
                          <span className="font-mono text-[10px] font-semibold tracking-wider text-white/35 uppercase">
                            {t("agent.systemPrompt")}
                          </span>
                          <div className="h-[1px] flex-1 bg-white/10" />
                        </div>
                      )}

                      {/* 渲染单个 Step 或 Group */}
                      {element.kind === "single" ? (
                        <AgentExecutionFlowItem
                          step={element.step}
                          isExpanded={isStepExpanded(element.step)}
                          onToggleExpand={() => toggleStepExpanded(element.step)}
                          turnStartIndex={
                            stepTurnStartIndices.get(element.step.id) ?? element.step.stepIndex
                          }
                        />
                      ) : (
                        <AgentExecutionFlowGroup
                          groupId={element.groupId}
                          steps={element.steps}
                          isExpanded={Boolean(groupExpansionOverrides[element.groupId])}
                          onToggleExpand={() => toggleGroupExpanded(element.groupId)}
                          isStepExpanded={isStepExpanded}
                          onToggleStepExpand={toggleStepExpanded}
                          stepTurnStartIndices={stepTurnStartIndices}
                        />
                      )}

                      {/* 当该 turn 结束且已完成所有步骤时，在下一行左侧展示该 turn 的综合执行数据统计 */}
                      {isTurnEnd &&
                        elementTurnIndex > 0 &&
                        turnStats &&
                        turnStats.isCompleted &&
                        (activeFilter === "all" || activeFilter === "assistant") && (
                          <div
                            data-testid={`turn-summary-${elementTurnIndex}`}
                            className="agent-turn-summary flex flex-wrap items-center gap-1.5 py-1 pl-1 font-mono text-[11px] text-white/40"
                          >
                            {turnStats.model && (
                              <span className="agent-turn-summary-pill agent-turn-summary-pill-model font-medium text-white/70">
                                {turnStats.model}
                              </span>
                            )}
                            {turnStats.toolCallsCount > 0 && (
                              <span className="agent-turn-summary-pill agent-turn-summary-pill-tools text-amber-300/90">
                                {t("agent.turnToolsCount", { count: turnStats.toolCallsCount })}
                              </span>
                            )}
                            {turnStats.inputTokens > 0 && (
                              <span className="agent-turn-summary-pill agent-turn-summary-pill-input">
                                {t("agent.turnInputTokens", {
                                  count: formatTokenCount(turnStats.inputTokens),
                                })}
                              </span>
                            )}
                            {turnStats.outputTokens > 0 && (
                              <span className="agent-turn-summary-pill agent-turn-summary-pill-output">
                                {t("agent.turnOutputTokens", {
                                  count: formatTokenCount(turnStats.outputTokens),
                                })}
                              </span>
                            )}
                            {turnStats.cacheReadTokens > 0 && turnStats.inputTokens > 0 && (
                              <span className="agent-turn-summary-pill agent-turn-summary-pill-cache text-sky-300/90">
                                {t("agent.turnCacheHit", {
                                  percent: Math.round(
                                    (turnStats.cacheReadTokens /
                                      (turnStats.inputTokens + turnStats.cacheReadTokens)) *
                                      100,
                                  ),
                                })}
                              </span>
                            )}
                            {turnStats.durationMs > 0 && (
                              <span className="agent-turn-summary-pill agent-turn-summary-pill-duration text-emerald-400/90">
                                {t("agent.turnDuration", {
                                  duration: formatDurationMs(turnStats.durationMs),
                                })}
                              </span>
                            )}
                          </div>
                        )}
                    </Fragment>
                  )
                })}
                {/* Agent 正在运行但尚未生成对应 step 块时的骨架加载条目 */}
                {showSkeletonLoading && (
                  <div
                    data-testid="flow-skeleton-loading"
                    className="agent-execution-flow-step flex h-8 items-center justify-between rounded-[6px] border border-white/5 bg-[#212121] px-2.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <div className="h-3.5 w-16 animate-pulse rounded bg-white/10" />
                      <div className="h-3.5 w-32 animate-pulse rounded bg-white/5 sm:w-48" />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] leading-none">
                      <LxIconButton
                        size="small"
                        aria-label="Running"
                        title={{ content: "Running", placement: "left" }}
                        className="text-sky-400"
                      >
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
                      </LxIconButton>
                    </div>
                  </div>
                )}
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
            <div className="text-[13px] font-medium text-white/60">
              {t("agent.noExecutionFlow")}
            </div>
            <div className="max-w-[240px] text-[12px] text-white/35">
              {t("agent.noExecutionFlowDesc")}
            </div>
          </div>
        )}
      </div>
    )
  },
)
