import { ChevronDown, Sparkles } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import { AgentMessageListSkeleton } from "@/features/agent/components/AgentMessageListSkeleton"
import { DEFAULT_PROMPT_CARDS } from "@/features/agent/constants"
import type { ChatMessage } from "@/features/agent/types"

interface AgentMessageListProps {
  messages: ChatMessage[]
  // Agent 会话是否仍在运行（agent_start ~ agent_end，含工具执行阶段）。
  isStreaming?: boolean
  // 历史会话是否正在恢复（驱动骨架屏与吸底跳转）。
  isRestoring?: boolean
  onSelectPrompt: (prompt: string) => void
  onEditMessage?: (id: string, newContent: string) => void
  onDeleteMessage?: (messageId: string) => void
}

// 距底部阈值（px），低于该距离视为贴底。
const NEAR_BOTTOM_THRESHOLD = 40

// AI 消息与同一轮后续消息的展示条目。
interface AgentMessageListEntry {
  // 原始消息。
  message: ChatMessage
  // 同一轮连续的工具结果或 AI 后续消息。
  continuationMessages: ChatMessage[]
}

/**
 * 将一次连续 Agent 执行聚合为单一 AI 气泡的展示条目。
 */
const groupAgentMessages = (messages: ChatMessage[]): AgentMessageListEntry[] =>
  messages.reduce<AgentMessageListEntry[]>((entries, message) => {
    const previousEntry = entries.at(-1)

    if (message.role !== "user" && previousEntry?.message.role === "assistant") {
      previousEntry.continuationMessages.push(message)
      return entries
    }

    entries.push({ message, continuationMessages: [] })
    return entries
  }, [])

/**
 * 渲染 Agent 消息列表与空状态。
 */
export const AgentMessageList = ({
  messages,
  isStreaming,
  isRestoring,
  onSelectPrompt,
  onEditMessage,
  onDeleteMessage,
}: AgentMessageListProps): React.JSX.Element => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)
  const [scrollButtonRendered, setScrollButtonRendered] = useState(false)
  const [scrollButtonAnimatingOut, setScrollButtonAnimatingOut] = useState(false)
  const messageEntries = useMemo(() => groupAgentMessages(messages), [messages])
  const lastEntry = messageEntries.at(-1)
  // Agent 运行期间由最后一条 AI 条目接管 loader，填补 turn 间隙（message_end ~ 下一轮 message_start），避免闪烁。
  const isLastEntryLoading = Boolean(isStreaming) && lastEntry?.message.role === "assistant"

  // 距底部阈值内视为贴底。
  const isNearBottom = (): boolean => {
    const el = scrollRef.current
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD
  }

  // 滚动位置决定吸底状态与滚动到底按钮的显隐：贴底恢复吸底并隐藏，上滚暂停吸底并显示。
  const handleScroll = (): void => {
    const nearBottom = isNearBottom()
    stickToBottomRef.current = nearBottom
    setShowScrollToBottom(!nearBottom)
  }

  // 会话恢复开始时强制回到吸底，确保骨架屏期间滚动贴底。
  useEffect(() => {
    if (!isRestoring) return
    stickToBottomRef.current = true
  }, [isRestoring])

  // 吸底或骨架屏期间内容变化后直接跳到列表底部；骨架屏结束后不再额外调整滚动。
  useEffect(() => {
    if (!isRestoring && !stickToBottomRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    setShowScrollToBottom(false)
  }, [messages, isRestoring])

  // 滚动到底按钮显隐过渡：消失时先播退出动画再卸载。
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

  // 点击按钮平滑滚动到底部。
  const scrollToBottom = (): void => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  }

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
            {messageEntries.map(({ message, continuationMessages }, index) => (
              <AgentMessageItem
                key={message.id}
                message={message}
                continuationMessages={continuationMessages}
                isLoading={index === messageEntries.length - 1 && isLastEntryLoading}
                isEditing={editingMessageId === message.id}
                onStartEdit={() => setEditingMessageId(message.id)}
                onCancelEdit={() => {
                  if (editingMessageId === message.id) {
                    setEditingMessageId(null)
                  }
                }}
                onEdit={(id, newContent) => {
                  onEditMessage?.(id, newContent)
                  setEditingMessageId(null)
                }}
                onDelete={onDeleteMessage}
              />
            ))}
          </div>

          {scrollButtonRendered && (
            // z-10 高于代码块/模板块头部（z-index: 1），避免其滚入底部区域时遮挡按钮。
            <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2">
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
