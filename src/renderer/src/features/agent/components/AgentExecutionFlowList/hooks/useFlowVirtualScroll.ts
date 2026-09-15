import type { ForwardedRef, RefObject } from "react"
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"
import {
  FOLLOW_BOTTOM_THRESHOLD,
  LOAD_MORE_TOP_THRESHOLD,
  WINDOW_INITIAL_SIZE,
  WINDOW_PAGE_SIZE,
} from "../constants"
import type {
  AgentExecutionFlowListRef,
  AgentFlowNavState,
  FilterKind,
  FlowRenderElement,
} from "../types"

type UseFlowVirtualScrollOptions = {
  ref: ForwardedRef<AgentExecutionFlowListRef>
  messages: readonly ChatMessage[]
  sessionId?: string
  activeFilter: FilterKind
  filteredSteps: ExecutionStep[]
  renderedFlowElements: FlowRenderElement[]
  stepsCount: number
  onNavigationStateChange?: (state: AgentFlowNavState) => void
}

type UseFlowVirtualScrollResult = {
  scrollRef: RefObject<HTMLDivElement | null>
  windowStartIndex: number
  visibleElements: FlowRenderElement[]
  loadMoreHistory: () => void
  handleScroll: () => void
  scrollToBottom: () => void
  canScrollBottom: boolean
}

/**
 * 执行流程滚动域：滑动窗口、吸底跟随、导航状态上报与命令式回到底部句柄。
 */
export const useFlowVirtualScroll = ({
  ref,
  messages,
  sessionId,
  activeFilter,
  filteredSteps,
  renderedFlowElements,
  stepsCount,
  onNavigationStateChange,
}: UseFlowVirtualScrollOptions): UseFlowVirtualScrollResult => {
  const scrollRef = useRef<HTMLDivElement>(null)

  // 滚动跟随：仅在滚动条位于底部时跟随；用户向上滚动离开底部暂停跟随，滚回底部恢复跟随。
  const followBottomRef = useRef(true)
  const prevScrollTopRef = useRef<number | null>(null)
  const hasInitialScrolledRef = useRef(false)

  const [canScrollBottom, setCanScrollBottom] = useState(false)

  // 会话切换时重置初始吸底标记
  useEffect(() => {
    hasInitialScrolledRef.current = false
    followBottomRef.current = true
    prevScrollTopRef.current = null
  }, [sessionId])

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
    if (!el || stepsCount === 0) {
      return { canScrollBottom: false }
    }
    return {
      canScrollBottom: !isNearBottom(),
    }
  }, [isNearBottom, stepsCount])

  const updateNavState = useCallback((): void => {
    const state = computeNavState()
    setCanScrollBottom(state.canScrollBottom)
    onNavigationStateChange?.(state)
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
    setCanScrollBottom(false)
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
  }, [filteredSteps, updateNavState])

  // 暴露命令式句柄（回到底部）。
  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
    }),
    [scrollToBottom],
  )

  return {
    scrollRef,
    windowStartIndex,
    visibleElements,
    loadMoreHistory,
    handleScroll,
    scrollToBottom,
    canScrollBottom,
  }
}
