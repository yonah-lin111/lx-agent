import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { ChevronUp } from "lucide-react"
import type React from "react"
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { AgentEmptyHero } from "@/features/agent/components/AgentEmptyHero"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import { AgentMessageListSkeleton } from "@/features/agent/components/AgentMessageListSkeleton"
import { AgentSuggestedPromptCards } from "@/features/agent/components/AgentSuggestedPromptCards"
import { useMessagePin } from "@/features/agent/hooks/useMessagePin"
import { buildQaGroups, groupAgentMessages } from "@/features/agent/messageGrouping"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

// 子代理调用块类型（点击 label 打开面板）。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

export interface AgentMessageListRef {
  scrollToPrevious: () => void
  scrollToNext: () => void
  scrollToBottom: () => void
  canScrollPrevious: boolean
  canScrollNext: boolean
  canScrollBottom: boolean
}

export interface AgentMessageListProps {
  messages: ChatMessage[]
  // Agent 会话是否仍在运行（agent_start ~ agent_end，含工具执行阶段）。
  isStreaming?: boolean
  // 历史会话是否正在恢复（驱动骨架屏与吸底跳转）。
  isRestoring?: boolean
  // 生成建议问题所需的完整会话上下文（仅最后一条 AI 回答使用）。
  suggestedQuestionContext?: SuggestedQuestionContextMessage[]
  // 点击建议问题直接发送。
  onSendSuggestedQuestion?: (question: string) => void
  // 点击建议问题回显到输入框并聚焦。
  onEchoToInput?: (question: string) => void
  onSelectPrompt: (prompt: string) => void
  onEditMessage?: (messageId: string, newContent: string) => void
  onDeleteMessage?: (messageId: string) => void
  // 点击"从此分支"：从该用户轮切割复制历史到新会话。
  onFork?: (userMessageTimestamp: number) => void
  // 点击子代理 label 打开面板弹窗。
  onOpenSubagent?: (toolCall: ToolCallBlock) => void
  // 面板是否打开（打开时禁用上下轮次导航，且滚动按钮接管当前打开面板的滚动）。
  isSubagentPanelOpen?: boolean
  // 当前打开面板的消息列表滚动容器（滚动按钮的目标）。
  subagentScrollRef?: React.RefObject<HTMLDivElement | null>
  // 最后一条 AI 回答被截断/中止时，"继续生成"可用（仅最后一条展示按钮）。
  canContinue?: boolean
  // 点击"继续生成"：续写被中断的上一轮输出。
  onContinue?: () => void
  // 滚动导航状态变动通知（供外部按钮响应 disabled 状态更新）。
  onNavigationStateChange?: (state: {
    canScrollPrevious: boolean
    canScrollNext: boolean
    canScrollBottom: boolean
  }) => void
}

const NEAR_BOTTOM_THRESHOLD = 250
const LOAD_MORE_TOP_THRESHOLD = 150
// 初始窗口大小：展示最新的 25 个 QA 组（通常覆盖 3~5 屏，DOM 节点少且响应快）。
const WINDOW_INITIAL_SIZE = 25
// 向上滚动触发加载时，每次追加的历史组数。
const WINDOW_PAGE_SIZE = 20

// 仅比较数据 props 的 memo：流式时 useAgentChat 只替换当前消息对象，其余消息引用不变，
// 借此跳过所有未变化消息的重渲染（其 markdown 渲染成本不再每 tick 重跑）。
const AgentMessageItemMemo = memo(AgentMessageItem, (prev, next) => {
  return (
    prev.message === next.message &&
    prev.continuationMessages === next.continuationMessages &&
    prev.isLoading === next.isLoading &&
    prev.isPinned === next.isPinned &&
    prev.isEditing === next.isEditing &&
    prev.isLastAssistant === next.isLastAssistant &&
    prev.readOnly === next.readOnly &&
    prev.showScrollToBottom === next.showScrollToBottom &&
    prev.canContinue === next.canContinue &&
    prev.suggestedQuestionContext === next.suggestedQuestionContext
  )
})

export const AgentMessageList = forwardRef<AgentMessageListRef, AgentMessageListProps>(
  (
    {
      messages,
      isStreaming,
      isRestoring,
      suggestedQuestionContext,
      onSendSuggestedQuestion,
      onEchoToInput,
      onSelectPrompt,
      onEditMessage,
      onDeleteMessage,
      onFork,
      onOpenSubagent,
      isSubagentPanelOpen = false,
      subagentScrollRef,
      canContinue,
      onContinue,
      onNavigationStateChange,
    },
    ref,
  ): React.JSX.Element => {
    const scrollRef = useRef<HTMLDivElement>(null)
    const stickToBottomRef = useRef(true)
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
    const [showScrollToBottom, setShowScrollToBottom] = useState(false)

    // 记录是否已完成会话的首次初始吸底定位。
    // 仅在首次进入会话时自动滚到底部；后续折叠与再次展开均严格保留用户之前的浏览位置。
    const hasInitialScrolledRef = useRef(false)
    // 实时记录用户在可见状态下的有效浏览位置与视口顶部的锚点消息（避免挤压/宽度过渡造成偏移）。
    const activeScrollTopRef = useRef<number | null>(null)
    const anchorMessageRef = useRef<{ groupKey: string; offsetFromTop: number } | null>(null)

    const messageEntries = useMemo(() => groupAgentMessages(messages), [messages])
    const messageGroups = useMemo(() => buildQaGroups(messageEntries), [messageEntries])

    // --- Telegram 风格 Sliding Window (滑动窗口) ---
    // 窗口起始索引：从该索引到末尾的 QA 组实际渲染到 DOM 中。
    const [windowStartIndex, setWindowStartIndex] = useState<number>(() =>
      Math.max(0, messageGroups.length - WINDOW_INITIAL_SIZE),
    )

    // 记录滚动位置与高度，供上滑追加历史后做滚动高度差补偿。
    const scrollCompensationRef = useRef<{
      prevScrollHeight: number
      prevScrollTop: number
    } | null>(null)

    // 待跳转定位的目标用户消息 ID（当定位目标在当前窗口之外时暂存）。
    const pendingLocateMessageIdRef = useRef<string | null>(null)

    // 会话切换（消息列表重置或恢复）时，重置滑动窗口与初次吸底标记。
    const prevMessagesLengthRef = useRef(messages.length)
    useEffect(() => {
      // 仅在消息列表被清空或大幅变动（如切换会话）时重置。
      if (messages.length === 0 || Math.abs(messages.length - prevMessagesLengthRef.current) > 5) {
        setWindowStartIndex(Math.max(0, messageGroups.length - WINDOW_INITIAL_SIZE))
        hasInitialScrolledRef.current = false
      }
      prevMessagesLengthRef.current = messages.length
    }, [messages.length, messageGroups.length])

    // 当前切片内的可见 QA 组。
    const visibleGroups = useMemo(
      () => messageGroups.slice(windowStartIndex),
      [messageGroups, windowStartIndex],
    )

    const lastGroup = messageGroups.at(-1)
    // Agent 运行期间由最后一条 AI 条目接管 loader，填补 turn 间隙。
    const isLastGroupLoading = Boolean(isStreaming) && lastGroup?.assistant != null
    // 各 QA 组的 DOM 引用（按组头用户消息 id 索引）。
    const messageGroupRefs = useRef(new Map<string, HTMLDivElement>())
    const { pinnedUserMessageId, attachUserMessageEndRef, updatePinnedQuestion } =
      useMessagePin(messageGroupRefs)
    const pinnedUserMessage = useMemo(() => {
      if (!pinnedUserMessageId) return undefined
      return messages.find((m) => m.id === pinnedUserMessageId)
    }, [messages, pinnedUserMessageId])

    // Pinned message state for smooth exit transition.
    const currentPinnedMessage = useMemo(() => {
      return !isSubagentPanelOpen && pinnedUserMessage ? pinnedUserMessage : null
    }, [isSubagentPanelOpen, pinnedUserMessage])

    const [displayPinnedMessage, setDisplayPinnedMessage] = useState<ChatMessage | null>(null)
    const [isClosing, setIsClosing] = useState(false)

    useEffect(() => {
      if (currentPinnedMessage) {
        setDisplayPinnedMessage(currentPinnedMessage)
        setIsClosing(false)
      } else {
        if (displayPinnedMessage && !isClosing) {
          setIsClosing(true)
        }
      }
    }, [currentPinnedMessage, displayPinnedMessage, isClosing])

    const handleAnimationEnd = useCallback(
      (e: React.AnimationEvent) => {
        if (isClosing && e.currentTarget === e.target) {
          setDisplayPinnedMessage(null)
          setIsClosing(false)
        }
      },
      [isClosing],
    )

    // 仅当存在 ≥2 个 QA 对时展示"从此分支"。
    const canFork = useMemo(
      () => messages.filter((message) => message.role === "user").length > 1,
      [messages],
    )

    const isNearBottom = useCallback((): boolean => {
      const el = isSubagentPanelOpen ? subagentScrollRef?.current : scrollRef.current
      if (!el) return true
      return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
    }, [isSubagentPanelOpen, subagentScrollRef])

    const attachMessageGroupRef =
      (groupId: string) =>
      (el: HTMLDivElement | null): void => {
        if (el) messageGroupRefs.current.set(groupId, el)
        else messageGroupRefs.current.delete(groupId)
      }

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
    }, [visibleGroups])

    // 所有带有用户消息的 QA 组列表
    const userMessageGroups = useMemo(
      () => messageGroups.filter((group) => group.userMessage != null),
      [messageGroups],
    )

    // 定位吸顶的用户消息：滚动到其在自然流中的位置。
    const performLocate = useCallback((messageId: string): void => {
      const el = scrollRef.current
      const group = messageGroupRefs.current.get(messageId)
      if (!el || !group) return
      const containerRect = el.getBoundingClientRect()
      const groupRect = group.getBoundingClientRect()
      const paddingTop = Number.parseFloat(window.getComputedStyle(el).paddingTop) || 0
      const delta = groupRect.top - (containerRect.top + paddingTop)
      const nextScrollTop = el.scrollTop + delta
      el.scrollTo({ top: nextScrollTop, behavior: "smooth" })
      stickToBottomRef.current = false
      activeScrollTopRef.current = nextScrollTop
      setShowScrollToBottom(true)
    }, [])

    // 定位用户消息入口：如果目标在当前滑动窗口之前，先扩展窗口再在 layoutEffect 中精确定位。
    const handleLocateMessage = useCallback(
      (messageId: string): void => {
        const targetIndex = messageGroups.findIndex((group) => group.userMessage?.id === messageId)
        if (targetIndex === -1) return

        if (targetIndex < windowStartIndex) {
          pendingLocateMessageIdRef.current = messageId
          setWindowStartIndex(Math.max(0, targetIndex - 5))
          return
        }

        performLocate(messageId)
      },
      [messageGroups, performLocate, windowStartIndex],
    )

    // 暂存的定位请求在 DOM 挂载更新后执行。
    useLayoutEffect(() => {
      const pendingId = pendingLocateMessageIdRef.current
      if (!pendingId) return
      performLocate(pendingId)
      pendingLocateMessageIdRef.current = null
    }, [visibleGroups, performLocate])

    const scrollToBottom = useCallback((): void => {
      // 面板打开时滚动面板消息列表，否则滚动主消息列表。
      const el = isSubagentPanelOpen ? subagentScrollRef?.current : scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }, [isSubagentPanelOpen, subagentScrollRef])

    // 计算“上一个”和“下一个”的目标用户问题 ID 与可用性
    const getNavigationTargets = useCallback((): {
      prevMessageId: string | null
      nextMessageId: string | null
    } => {
      const el = scrollRef.current
      if (!el || userMessageGroups.length === 0) {
        return { prevMessageId: null, nextMessageId: null }
      }

      const containerRect = el.getBoundingClientRect()
      const scrollThreshold = 10

      // 收集所有已渲染的用户消息元素相对视口顶部的 offset
      // top <= scrollThreshold: 认为该问题已经进入或滑过视口顶部（在视口上方或正贴顶）
      // top > scrollThreshold: 认为该问题在当前视口内部或下方
      const items: {
        index: number
        id: string
        top: number
      }[] = []

      for (let i = 0; i < userMessageGroups.length; i++) {
        const id = userMessageGroups[i].userMessage!.id
        const groupEl = messageGroupRefs.current.get(id)
        if (groupEl) {
          const top = groupEl.getBoundingClientRect().top - containerRect.top
          items.push({ index: i, id, top })
        }
      }

      // 如果当前顶部有吸顶消息（比如滚动在 q2 的长回答中，q2 吸顶）
      // 此时视口内的位置属于 q2 这一轮。点击“上一个”，如果 q2 本身就在视口上方，
      // 用户期望的是看 q2 还是看 q1？如果当前视口已经在 q2 的回答下方（比如 q3 刚露头或在 q2 回答区），
      // 点击“上一个”应定位到 q2；如果当前视口顶部正好对齐 q2（top ≈ 0），再次点击“上一个”才跳到 q1。

      // 1. 找到在当前视口顶部及上方的所有问题中，最靠下的那一个（即当前视口所属或紧邻上方的问题）
      const aboveOrAtTop = items.filter((item) => item.top <= scrollThreshold)
      // 2. 找到严格在当前视口顶部下方的第一个问题
      const belowTop = items.filter((item) => item.top > scrollThreshold)

      // 特别处理：如果有吸顶消息
      if (pinnedUserMessageId) {
        const pinnedIndex = userMessageGroups.findIndex(
          (group) => group.userMessage?.id === pinnedUserMessageId,
        )
        if (pinnedIndex !== -1) {
          // 当前吸顶的是 q2，说明视口正在浏览 q2 的回答内容。
          // 点击“上一个”应该精确定位到 q2 本身！
          // 只有当 q2 本身已经被定位到视口顶部（即 q2 不再吸顶或 q2 就在顶端）时，上一个才是 q1。
          return {
            prevMessageId: userMessageGroups[pinnedIndex]?.userMessage?.id ?? null,
            nextMessageId:
              pinnedIndex + 1 < userMessageGroups.length
                ? (userMessageGroups[pinnedIndex + 1]?.userMessage?.id ?? null)
                : null,
          }
        }
      }

      // 无吸顶时的通用逻辑：
      // 如果当前视口最接近的问题 top < -30px（说明该问题已经被向上滚出一段距离，例如在 q3 的中间），
      // 那么“上一个”应该先滚动到当前问题顶部（如果它偏离较大），或者滚动到前一个问题
      let prevIndex: number | null = null
      let nextIndex: number | null = null

      if (aboveOrAtTop.length > 0) {
        const lastAbove = aboveOrAtTop[aboveOrAtTop.length - 1]
        if (lastAbove.top < -50) {
          // 视口已经滑出该问题 50px 以上，先回到该问题顶部
          prevIndex = lastAbove.index
          nextIndex = lastAbove.index + 1 < userMessageGroups.length ? lastAbove.index + 1 : null
        } else {
          // 已经基本在这个问题顶部，上一个为再前一个
          prevIndex = lastAbove.index > 0 ? lastAbove.index - 1 : null
          nextIndex = lastAbove.index + 1 < userMessageGroups.length ? lastAbove.index + 1 : null
        }
      } else if (belowTop.length > 0) {
        prevIndex = null
        nextIndex = belowTop[0].index
      }

      const prevMessageId =
        prevIndex !== null && prevIndex >= 0
          ? (userMessageGroups[prevIndex]?.userMessage?.id ?? null)
          : null
      const nextMessageId =
        nextIndex !== null && nextIndex < userMessageGroups.length
          ? (userMessageGroups[nextIndex]?.userMessage?.id ?? null)
          : null

      return { prevMessageId, nextMessageId }
    }, [pinnedUserMessageId, userMessageGroups])

    const scrollToPrevious = useCallback((): void => {
      if (isSubagentPanelOpen) return
      const { prevMessageId } = getNavigationTargets()
      if (prevMessageId) {
        handleLocateMessage(prevMessageId)
      }
    }, [isSubagentPanelOpen, getNavigationTargets, handleLocateMessage])

    const scrollToNext = useCallback((): void => {
      if (isSubagentPanelOpen) return
      const { nextMessageId } = getNavigationTargets()
      if (nextMessageId) {
        handleLocateMessage(nextMessageId)
      }
    }, [isSubagentPanelOpen, getNavigationTargets, handleLocateMessage])

    // 计算当前是否可滚动
    const computeNavState = useCallback(() => {
      const hasMessages = messages.length > 0
      const nearBottom = isNearBottom()

      if (isSubagentPanelOpen) {
        return {
          canScrollPrevious: false,
          canScrollNext: false,
          canScrollBottom: !nearBottom,
        }
      }

      const { prevMessageId, nextMessageId } = getNavigationTargets()

      return {
        canScrollPrevious: hasMessages && prevMessageId !== null,
        canScrollNext: hasMessages && nextMessageId !== null,
        canScrollBottom: hasMessages && !nearBottom,
      }
    }, [getNavigationTargets, isNearBottom, isSubagentPanelOpen, messages.length])

    // 通知外部导航状态
    const updateNavState = useCallback(() => {
      if (!onNavigationStateChange) return
      onNavigationStateChange(computeNavState())
    }, [computeNavState, onNavigationStateChange])

    // 暴露 ref 句柄
    useImperativeHandle(
      ref,
      () => ({
        scrollToPrevious,
        scrollToNext,
        scrollToBottom,
        ...computeNavState(),
      }),
      [scrollToPrevious, scrollToNext, scrollToBottom, computeNavState],
    )

    // 处理滚动事件：吸底状态检测、吸顶问题更新、触顶自动扩展历史。
    const handleScroll = (): void => {
      const el = scrollRef.current
      if (!el || el.clientHeight <= 0) return

      const nearBottom = isNearBottom()
      const prevScrollTop = activeScrollTopRef.current
      const isScrollingUp = prevScrollTop !== null && prevScrollTop - el.scrollTop > 0.5

      if (isScrollingUp) {
        stickToBottomRef.current = false
      } else {
        stickToBottomRef.current = nearBottom
      }

      // 仅在真实可见并渲染时，实时记录用户的有效浏览像素位置
      activeScrollTopRef.current = el.scrollTop

      // 记录视口顶部的消息锚点：寻找当前最贴近视口顶部的消息组，供展开后精确锚定
      if (!nearBottom) {
        const containerRect = el.getBoundingClientRect()
        let bestKey: string | null = null
        let bestOffset = -Infinity
        for (const [key, groupEl] of messageGroupRefs.current) {
          const offset = groupEl.getBoundingClientRect().top - containerRect.top
          // 寻找顶部在视口顶上方最近或刚进入视口顶部的消息
          if (offset <= 100 && offset > bestOffset) {
            bestKey = key
            bestOffset = offset
          }
        }
        if (bestKey) {
          anchorMessageRef.current = { groupKey: bestKey, offsetFromTop: bestOffset }
        }
      } else {
        anchorMessageRef.current = null
      }

      setShowScrollToBottom(!nearBottom)
      updatePinnedQuestion(el)
      updateNavState()

      // 向上滑动接近顶部时，自动拉取上一页历史并无感补偿滚动。
      if (el.scrollTop < LOAD_MORE_TOP_THRESHOLD && windowStartIndex > 0) {
        loadMoreHistory()
      }
    }

    // 会话恢复开始时重置为需要吸底。
    useEffect(() => {
      if (!isRestoring) return
      hasInitialScrolledRef.current = false
      stickToBottomRef.current = true
      activeScrollTopRef.current = null
      anchorMessageRef.current = null
    }, [isRestoring])

    // 新建对话后复位滚动状态。
    useEffect(() => {
      if (messages.length !== 0) return
      hasInitialScrolledRef.current = false
      stickToBottomRef.current = true
      activeScrollTopRef.current = null
      anchorMessageRef.current = null
      setShowScrollToBottom(false)
      setWindowStartIndex(0)
      updateNavState()
    }, [messages, updateNavState])

    // 监听侧边栏折叠与展开：
    // 1. 展开时：若为首次进入则吸底并置 true；
    // 2. 若此前已在该会话中浏览：根据锚点消息精确对齐视口（完全无视宽度过渡过程中的挤压变形）！
    useEffect(() => {
      let timer: number | undefined
      const unsubscribe = rightSidebarStore.subscribe(() => {
        const isCollapsed = rightSidebarStore.isCollapsed()
        if (isCollapsed) return

        const restoreScrollPosition = (): void => {
          const targetEl = scrollRef.current
          if (!targetEl || targetEl.clientHeight <= 0) return

          if (!hasInitialScrolledRef.current) {
            // 首次进入该会话：吸底
            targetEl.scrollTop = targetEl.scrollHeight
            hasInitialScrolledRef.current = true
            stickToBottomRef.current = true
            setShowScrollToBottom(false)
          } else if (stickToBottomRef.current) {
            // 折叠前用户处于底部：继续贴底
            targetEl.scrollTop = targetEl.scrollHeight
            setShowScrollToBottom(false)
          } else if (anchorMessageRef.current) {
            // 折叠前用户在浏览历史：优先通过锚点消息几何位置精准对齐
            const { groupKey, offsetFromTop } = anchorMessageRef.current
            const groupEl = messageGroupRefs.current.get(groupKey)
            if (groupEl) {
              const currentOffset =
                groupEl.getBoundingClientRect().top - targetEl.getBoundingClientRect().top
              const diff = currentOffset - offsetFromTop
              targetEl.scrollTop += diff
              setShowScrollToBottom(true)
            } else if (activeScrollTopRef.current !== null) {
              targetEl.scrollTop = activeScrollTopRef.current
              setShowScrollToBottom(true)
            }
          } else if (activeScrollTopRef.current !== null) {
            targetEl.scrollTop = activeScrollTopRef.current
            setShowScrollToBottom(true)
          }
          updateNavState()
        }

        // 展开时立即执行一次对齐，宽度过渡（300ms）结束后再次精准对齐
        restoreScrollPosition()
        timer = window.setTimeout(restoreScrollPosition, 320)
      })

      return () => {
        unsubscribe()
        if (timer !== undefined) window.clearTimeout(timer)
      }
    }, [updateNavState])

    // 消息加载完成或流式新增时：仅首次进入或用户主动处于贴底状态时跟随贴底。
    useLayoutEffect(() => {
      const el = scrollRef.current
      if (!el || el.clientHeight <= 0) return

      if (!hasInitialScrolledRef.current && visibleGroups.length > 0) {
        el.scrollTop = el.scrollHeight
        hasInitialScrolledRef.current = true
        setShowScrollToBottom(false)
        updateNavState()
        return
      }

      if (isRestoring || stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight
        setShowScrollToBottom(false)
      }
      updateNavState()
    }, [visibleGroups, isRestoring, updateNavState])

    // 面板打开时，滚动按钮的可见性改由面板消息列表的滚动位置驱动。
    useEffect(() => {
      const el = isSubagentPanelOpen ? subagentScrollRef?.current : null
      if (!el) return
      const handlePanelScroll = (): void => {
        const notBottom = el.scrollHeight - el.scrollTop - el.clientHeight >= NEAR_BOTTOM_THRESHOLD
        setShowScrollToBottom(notBottom)
        updateNavState()
      }
      el.addEventListener("scroll", handlePanelScroll)
      handlePanelScroll()
      return () => el.removeEventListener("scroll", handlePanelScroll)
    }, [isSubagentPanelOpen, subagentScrollRef, updateNavState])

    // 面板关闭后恢复由主消息列表驱动。
    useEffect(() => {
      if (isSubagentPanelOpen) return
      const el = scrollRef.current
      if (!el) return
      const notBottom = el.scrollHeight - el.scrollTop - el.clientHeight >= NEAR_BOTTOM_THRESHOLD
      setShowScrollToBottom(notBottom)
      updateNavState()
    }, [isSubagentPanelOpen, updateNavState])

    // 用户发送新消息后平滑滚动到底部。
    const prevMessagesRef = useRef<ChatMessage[]>(messages)
    useEffect(() => {
      const prev = prevMessagesRef.current
      prevMessagesRef.current = messages
      if (isRestoring) return
      if (
        !messages
          .slice(prev.length)
          .some((message) => message.role === "user" && !message.isQueuedDrain)
      )
        return
      const el = scrollRef.current
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
    }, [messages, isRestoring])

    const hasHiddenHistory = windowStartIndex > 0

    return (
      <div className="agent-message-list-container relative flex min-h-0 min-w-0 flex-1 flex-col">
        {messages.length === 0 ? (
          <div className="agent-empty-state flex h-full flex-col justify-between p-1 select-none">
            <AgentEmptyHero mode="qa" className="flex-1" />

            <div className="mb-1">
              <AgentSuggestedPromptCards onSelectPrompt={onSelectPrompt} />
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Pinned absolute floating user message at the top */}
            {displayPinnedMessage && (
              <div
                className={`absolute top-0 left-0 right-0 z-30 px-1 pt-1 ${
                  isClosing ? "animate-pinned-out" : "animate-pinned-in"
                }`}
                onAnimationEnd={handleAnimationEnd}
              >
                <AgentMessageItemMemo
                  key={displayPinnedMessage.id}
                  message={displayPinnedMessage}
                  isPinned={true}
                  onLocate={() => handleLocateMessage(displayPinnedMessage.id)}
                  isEditing={editingMessageId === displayPinnedMessage.id}
                  onStartEdit={() => setEditingMessageId(displayPinnedMessage.id)}
                  onCancelEdit={() => {
                    if (editingMessageId === displayPinnedMessage.id) {
                      setEditingMessageId(null)
                    }
                  }}
                  onEdit={(id, newContent) => {
                    onEditMessage?.(id, newContent)
                    setEditingMessageId(null)
                  }}
                  onDelete={onDeleteMessage}
                  onFork={canFork ? onFork : undefined}
                  onOpenSubagent={onOpenSubagent}
                />
              </div>
            )}

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-1 [scrollbar-gutter:stable]"
            >
              {/* 滑动窗口：顶部存在折叠历史时，展示加载入口与未展开条数 */}
              {hasHiddenHistory && (
                <div className="flex w-full justify-center pt-1 pb-2">
                  <button
                    type="button"
                    onClick={loadMoreHistory}
                    className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
                  >
                    <ChevronUp className="h-3 w-3" />
                    <span>加载更早消息 ({windowStartIndex} 条未展开)</span>
                  </button>
                </div>
              )}

              {visibleGroups.map((group, index) => {
                const userMessage = group.userMessage
                const assistant = group.assistant
                const groupKey = userMessage?.id ?? assistant?.message.id
                const isLastGroup = index === visibleGroups.length - 1
                const isLastGroupAi = isLastGroup && assistant?.message.role !== "compactionSummary"
                const isLastGroupCompaction =
                  isLastGroup && assistant?.message.role === "compactionSummary"

                return (
                  <div
                    key={groupKey}
                    ref={groupKey ? attachMessageGroupRef(groupKey) : undefined}
                    className={isLastGroupAi || isLastGroupCompaction ? "mb-16" : ""}
                  >
                    {userMessage && (
                      <>
                        {/* 用户消息普通容器，不再有 sticky 属性 */}
                        <div className="mb-4 w-full">
                          <AgentMessageItemMemo
                            message={userMessage}
                            isPinned={false}
                            onLocate={undefined}
                            isEditing={editingMessageId === userMessage.id}
                            onStartEdit={() => setEditingMessageId(userMessage.id)}
                            onCancelEdit={() => {
                              if (editingMessageId === userMessage.id) {
                                setEditingMessageId(null)
                              }
                            }}
                            onEdit={(id, newContent) => {
                              onEditMessage?.(id, newContent)
                              setEditingMessageId(null)
                            }}
                            onDelete={onDeleteMessage}
                            onFork={canFork ? onFork : undefined}
                            onOpenSubagent={onOpenSubagent}
                          />
                        </div>
                        <div
                          ref={attachUserMessageEndRef(userMessage.id)}
                          className="h-0 -translate-y-4"
                          aria-hidden="true"
                        />
                      </>
                    )}
                    {assistant && (
                      <AgentMessageItemMemo
                        message={assistant.message}
                        continuationMessages={assistant.continuationMessages}
                        isLoading={isLastGroup && isLastGroupLoading}
                        showScrollToBottom={showScrollToBottom}
                        isLastAssistant={isLastGroupAi}
                        suggestedQuestionContext={
                          isLastGroupAi ? suggestedQuestionContext : undefined
                        }
                        onSendSuggestedQuestion={
                          isLastGroupAi ? onSendSuggestedQuestion : undefined
                        }
                        onEchoToInput={isLastGroupAi ? onEchoToInput : undefined}
                        onDelete={isLastGroupAi ? onDeleteMessage : undefined}
                        onOpenSubagent={onOpenSubagent}
                        canContinue={isLastGroupAi ? canContinue : false}
                        onContinue={isLastGroupAi ? onContinue : undefined}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <AgentMessageListSkeleton isLoading={isRestoring === true} />
      </div>
    )
  },
)

AgentMessageList.displayName = "AgentMessageList"
