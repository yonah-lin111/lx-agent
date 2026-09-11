import type { OpenClawChatMessage } from "@shared/contracts/openclaw"
import type React from "react"
import { useEffect, useRef } from "react"
import { useTranslation } from "@/i18n"
import { type ConversationAgent, OpenClawMessageItem } from "./OpenClawMessageItem"

export interface OpenClawMessageListProps {
  agent?: ConversationAgent
  messages: OpenClawChatMessage[]
  isStreaming?: boolean
}

/**
 * OpenClawMessageList - 对齐 AgentMessageList 布局风格的单员工会话列表
 */
export const OpenClawMessageList = ({
  agent,
  messages,
  isStreaming = false,
}: OpenClawMessageListProps): React.JSX.Element => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastMessage = messages[messages.length - 1]

  // 新消息或流式增量时滚动到底部
  const scrollSignal = `${messages.length}:${lastMessage?.content.length ?? 0}:${isStreaming ? 1 : 0}`
  useEffect(() => {
    const container = scrollRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [scrollSignal])

  if (messages.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <p className="text-xs text-white/45">{t("openclaw.conversationEmpty")}</p>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        {messages.map((message) => (
          <OpenClawMessageItem
            key={message.id}
            agentId={agent?.agentId ?? ""}
            message={message}
            agent={agent}
            isStreaming={isStreaming && message.status === "streaming"}
          />
        ))}

        {isStreaming && (
          <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-white/40">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/80" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/80 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/80 [animation-delay:300ms]" />
            </span>
            <span>{t("openclaw.working")}</span>
          </div>
        )}
      </div>
    </div>
  )
}
