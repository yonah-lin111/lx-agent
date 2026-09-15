import type { OpenClawSessionStats } from "@shared/contracts/openclaw"
import type React from "react"
import { useEffect, useMemo, useRef } from "react"
import { useTranslation } from "@/i18n"
import type { OfficeTimelineMessage } from "../../hooks/useOpenClawOffice"
import { type ConversationAgent, OpenClawMessageItem } from "./OpenClawMessageItem"

export interface OpenClawMessageListProps {
  timeline: OfficeTimelineMessage[]
  agents: ConversationAgent[]
  streamingAgentIds: string[]
  // 各 Agent 的会话级模型与上下文用量；仅各 Agent 最新一条 AI 消息展示。
  sessionStats?: Record<string, OpenClawSessionStats | undefined>
}

/**
 * OpenClawMessageList - 对齐 AgentMessageList 布局风格的多员工合流时间线列表
 */
export const OpenClawMessageList = ({
  timeline,
  agents,
  streamingAgentIds,
  sessionStats,
}: OpenClawMessageListProps): React.JSX.Element => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastMessage = timeline[timeline.length - 1]

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents])

  // 每个 Agent 的最新一条 AI 消息 id：仅该条承载会话级模型与上下文概要。
  const latestAssistantIds = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of timeline) {
      if (item.message.role === "assistant") map.set(item.agentId, item.message.id)
    }
    return map
  }, [timeline])

  // 新消息或流式增量时滚动到底部
  const scrollSignal = `${timeline.length}:${lastMessage?.message.content.length ?? 0}:${streamingAgentIds.length}`
  useEffect(() => {
    const container = scrollRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [scrollSignal])

  if (timeline.length === 0) {
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
        {timeline.map((item) => {
          const { agentId, message, targetAgentIds } = item
          const agent = agentMap.get(agentId)
          const targetAgents = targetAgentIds
            ? targetAgentIds
                .map((id) => agentMap.get(id))
                .filter((a): a is ConversationAgent => Boolean(a))
            : undefined
          const isStreaming = streamingAgentIds.includes(agentId)

            return (
              <OpenClawMessageItem
                key={message.id}
                agentId={agentId}
                message={message}
                agent={agent}
                targetAgents={targetAgents}
                isStreaming={isStreaming}
                stats={
                  latestAssistantIds.get(agentId) === message.id
                    ? sessionStats?.[agentId]
                    : undefined
                }
              />
            )
        })}

        {streamingAgentIds.length > 0 && (
          <div className="flex items-center gap-1.5 px-1 py-1 text-[11px] text-white/40">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/80" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/80 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400/80 [animation-delay:300ms]" />
            </span>
            <span>{t("openclaw.workingCount", { count: streamingAgentIds.length })}</span>
          </div>
        )}
      </div>
    </div>
  )
}
