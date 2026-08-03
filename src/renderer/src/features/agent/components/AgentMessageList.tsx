import { Sparkles } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import { DEFAULT_PROMPT_CARDS } from "@/features/agent/constants"
import type { ChatMessage } from "@/features/agent/types"

interface AgentMessageListProps {
  messages: ChatMessage[]
  onSelectPrompt: (prompt: string) => void
  onEditMessage?: (id: string, newContent: string) => void
}

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
  onSelectPrompt,
  onEditMessage,
}: AgentMessageListProps): React.JSX.Element => {
  const bottomRef = useRef<HTMLDivElement>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const messageEntries = useMemo(() => groupAgentMessages(messages), [messages])

  // 新消息出现时自动滚动到底部。
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  if (messages.length === 0) {
    return (
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
    )
  }

  return (
    <div className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto p-1 [scrollbar-gutter:stable]">
      {messageEntries.map(({ message, continuationMessages }) => (
        <AgentMessageItem
          key={message.id}
          message={message}
          continuationMessages={continuationMessages}
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
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
