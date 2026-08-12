import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import { ChevronDown, Sparkles } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import { AgentMessageListSkeleton } from "@/features/agent/components/AgentMessageListSkeleton"
import { DEFAULT_PROMPT_CARDS } from "@/features/agent/constants"
import { useMessagePin } from "@/features/agent/hooks/useMessagePin"
import { buildQaGroups, groupAgentMessages } from "@/features/agent/messageGrouping"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"

// 子代理调用块类型（点击 label 打开面板）。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

interface AgentMessageListProps {
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
  // 点击子代理 label 打开面板弹窗。
  onOpenSubagent?: (toolCall: ToolCallBlock) => void
  // 子代理面板是否打开（打开时滚动按钮接管面板消息列表滚动）。
  isSubagentPanelOpen?: boolean
  // 子代理面板消息列表滚动容器（滚动按钮的目标）。
  subagentScrollRef?: React.RefObject<HTMLDivElement | null>
  // 最后一条 AI 回答被截断/中止时，"继续生成"可用（仅最后一条展示按钮）。
  canContinue?: boolean
  // 点击"继续生成"：续写被中断的上一轮输出。
  onContinue?: () => void
}

const NEAR_BOTTOM_THRESHOLD = 40

export const AgentMessageList = ({
  messages,
  isStreaming,
  isRestoring,
  suggestedQuestionContext,
  onSendSuggestedQuestion,
  onEchoToInput,
  onSelectPrompt,
  onEditMessage,
  onDeleteMessage,
  onOpenSubagent,
  isSubagentPanelOpen = false,
  subagentScrollRef,
  canContinue,
  onContinue,
}: AgentMessageListProps): React.JSX.Element => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [scrollButtonRendered, setScrollButtonRendered] = useState(false)
  const [scrollButtonAnimatingOut, setScrollButtonAnimatingOut] = useState(false)
  const messageEntries = useMemo(() => groupAgentMessages(messages), [messages])
  const messageGroups = useMemo(() => buildQaGroups(messageEntries), [messageEntries])
  const lastGroup = messageGroups.at(-1)
  // Agent 运行期间由最后一条 AI 条目接管 loader，填补 turn 间隙。
  const isLastGroupLoading = Boolean(isStreaming) && lastGroup?.assistant != null
  // 最后一条真实 AI 回答所在 group 索引（压缩摘要块不占用"最后一条"位置，避免建议问题错位）。
  const lastRealAssistantIndex = useMemo(() => {
    for (let index = messageGroups.length - 1; index >= 0; index--) {
      if (messageGroups[index]?.assistant?.message.role !== "compactionSummary") {
        return index
      }
    }
    return -1
  }, [messageGroups])
  const { pinnedUserMessageId, attachUserMessageEndRef, updatePinnedQuestion } = useMessagePin()

  const isNearBottom = (): boolean => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }

  const handleScroll = (): void => {
    const nearBottom = isNearBottom()
    stickToBottomRef.current = nearBottom
    setShowScrollToBottom(!nearBottom)
    updatePinnedQuestion(scrollRef.current)
  }

  // 会话恢复开始时强制回到吸底，确保骨架屏期间滚动贴底。
  useEffect(() => {
    if (!isRestoring) return
    stickToBottomRef.current = true
  }, [isRestoring])

  // 吸底或骨架屏期间内容变化后同步跳到列表底部。
  useLayoutEffect(() => {
    if (!isRestoring && !stickToBottomRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    setShowScrollToBottom(false)
  }, [messages, isRestoring])

  useEffect(() => {
    if (showScrollToBottom) {
      setScrollButtonRendered(true)
      return
    }
    if (!scrollButtonRendered) return

    setScrollButtonAnimatingOut(true)
    const timer = setTimeout(() => {
      setScrollButtonRendered(false)
      setScrollButtonAnimatingOut(false)
    }, 120)
    return () => clearTimeout(timer)
  }, [showScrollToBottom, scrollButtonRendered])

  const scrollToBottom = (): void => {
    // 面板打开时滚动面板消息列表，否则滚动主消息列表。
    const el = isSubagentPanelOpen ? subagentScrollRef?.current : scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }

  // 面板打开时，滚动按钮的可见性改由面板消息列表的滚动位置驱动。
  useEffect(() => {
    const el = isSubagentPanelOpen ? subagentScrollRef?.current : null
    if (!el) return
    const handlePanelScroll = (): void => {
      setShowScrollToBottom(
        el.scrollHeight - el.scrollTop - el.clientHeight >= NEAR_BOTTOM_THRESHOLD,
      )
    }
    el.addEventListener("scroll", handlePanelScroll)
    handlePanelScroll()
    return () => el.removeEventListener("scroll", handlePanelScroll)
  }, [isSubagentPanelOpen, subagentScrollRef])

  // 面板关闭后恢复由主消息列表驱动。
  useEffect(() => {
    if (isSubagentPanelOpen) return
    const el = scrollRef.current
    if (!el) return
    setShowScrollToBottom(el.scrollHeight - el.scrollTop - el.clientHeight >= NEAR_BOTTOM_THRESHOLD)
  }, [isSubagentPanelOpen])

  // 用户发送新消息后平滑滚动到底部（以 prev 快照判定追加新增）。
  const prevMessagesRef = useRef<ChatMessage[]>(messages)
  useEffect(() => {
    const prev = prevMessagesRef.current
    prevMessagesRef.current = messages
    if (isRestoring) return
    if (!messages.slice(prev.length).some((message) => message.role === "user")) return
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }, [messages, isRestoring])

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col justify-between p-1 select-none">
          <div className="mt-8 flex flex-col items-center text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[6px] border border-white/10 bg-white/5 text-emerald-400 shadow-inner">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-[14px] font-semibold text-white/90">LX Agent 智能助手</h3>
            <p className="mt-1 max-w-[260px] text-[12px] text-white/40">
              我是您的 AI 研发副手，随时协助解答架构、代码重构与单测编写问题。
            </p>
          </div>

          <div className="mb-1 flex flex-col gap-2">
            <span className="px-1 text-[11px] font-medium text-white/35">快捷灵感推荐：</span>
            {DEFAULT_PROMPT_CARDS.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onSelectPrompt(card.prompt)}
                className="flex flex-col items-start rounded-[6px] bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/10 active:scale-[0.99]"
              >
                <span className="text-[12px] font-medium text-white/80">{card.title}</span>
                <span className="mt-0.5 text-[11px] text-white/40">{card.description}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="custom-scrollbar flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-1 [scrollbar-gutter:stable]"
          >
            {messageGroups.map((group, index) => {
              const userMessage = group.userMessage
              const assistant = group.assistant
              const groupKey = userMessage?.id ?? assistant?.message.id
              const isLastGroupAi = lastRealAssistantIndex >= 0 && index === lastRealAssistantIndex
              return (
                <div key={groupKey} className={isLastGroupAi ? "mb-16" : ""}>
                  {userMessage && (
                    <>
                      {/* 用户消息完全离开视口后，才将问题钉住视口顶部。 */}
                      <div
                        className={`top-0 z-20 mb-4 w-full ${
                          pinnedUserMessageId === userMessage.id ? "sticky" : ""
                        }`}
                      >
                        <AgentMessageItem
                          message={userMessage}
                          isPinned={pinnedUserMessageId === userMessage.id}
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
                    <AgentMessageItem
                      message={assistant.message}
                      continuationMessages={assistant.continuationMessages}
                      isLoading={index === messageGroups.length - 1 && isLastGroupLoading}
                      isLastAssistant={isLastGroupAi}
                      suggestedQuestionContext={
                        isLastGroupAi ? suggestedQuestionContext : undefined
                      }
                      onSendSuggestedQuestion={isLastGroupAi ? onSendSuggestedQuestion : undefined}
                      onEchoToInput={isLastGroupAi ? onEchoToInput : undefined}
                      // 仅最后一组 QA 展示删除入口。
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

          {scrollButtonRendered && (
            // z-30 高于吸顶问题(z-20)与代码块/模板块头部，避免被遮挡而无法点击。
            <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2">
              <button
                type="button"
                aria-label="滚动到底部"
                onClick={scrollToBottom}
                className={`relative flex items-center justify-center rounded-full shadow-lg transition-all active:scale-95 ${
                  isStreaming
                    ? "h-10 w-10 bg-transparent"
                    : "h-8 w-8 border border-white/10 bg-[#303030] text-white/60 hover:bg-[#4a4a4a] hover:text-white"
                } ${scrollButtonAnimatingOut ? "animate-tooltip-out" : "animate-tooltip-in"}`}
              >
                {isStreaming ? (
                  <>
                    <div className="lx-liquid-loader lx-liquid-loader-lg">
                      <span className="lx-liquid-blob" />
                    </div>
                    <ChevronDown className="absolute h-4 w-4 text-[#212121]" />
                  </>
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>
      )}

      <AgentMessageListSkeleton isLoading={isRestoring === true} />
    </div>
  )
}
