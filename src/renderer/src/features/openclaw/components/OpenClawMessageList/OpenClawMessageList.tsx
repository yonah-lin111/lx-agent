import { ArrowDownToLine } from "lucide-react"
import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import type { OfficeTimelineMessage } from "../../hooks/useOpenClawOffice"
import { type ConversationAgent, OpenClawMessageItem } from "./OpenClawMessageItem"

// 视为"在底部附近"的滚动余量（px）。
const NEAR_BOTTOM_THRESHOLD = 150

export interface OpenClawMessageListProps {
  timeline: OfficeTimelineMessage[]
  agents: ConversationAgent[]
}

/**
 * OpenClawMessageList - 对齐 AgentMessageList 布局风格的多员工合流时间线列表
 */
export const OpenClawMessageList = ({
  timeline,
  agents,
}: OpenClawMessageListProps): React.JSX.Element => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // 吸底状态：用户主动上滚后释放，滚回底部附近后恢复。
  const stickToBottomRef = useRef(true)
  const lastScrollTopRef = useRef<number | null>(null)
  const [showScrollToBottom, setShowScrollToBottom] = useState(false)

  const lastMessage = timeline[timeline.length - 1]
  // 内容信号：新消息与流式增量都会改变该值，驱动吸底跟随。
  const contentSignal = `${timeline.length}:${lastMessage?.message.content.length ?? 0}`

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents])

  // 切换办公区/员工集合时重置为吸底。
  useEffect(() => {
    stickToBottomRef.current = true
    lastScrollTopRef.current = null
    setShowScrollToBottom(false)
  }, [agents])

  // 用户发送新消息后平滑滚动到底部（对齐 AgentMessageList）。
  const prevMessageIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    const previousIds = prevMessageIdsRef.current
    prevMessageIdsRef.current = new Set(timeline.map((item) => item.message.id))
    if (!previousIds) return
    const hasNewUserMessage = timeline.some(
      (item) => item.message.role === "user" && !previousIds.has(item.message.id),
    )
    if (!hasNewUserMessage) return
    stickToBottomRef.current = true
    setShowScrollToBottom(false)
    const container = scrollRef.current
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
  }, [timeline])

  // 新消息或流式增量时：仅在吸底状态下跟随到底部。
  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container || container.clientHeight <= 0) return
    if (!stickToBottomRef.current) return
    container.scrollTop = container.scrollHeight
    setShowScrollToBottom(false)
  }, [contentSignal])

  // 滚动事件：识别用户主动上滚以释放吸底，并据此显示回到底部按钮。
  const handleScroll = (): void => {
    const container = scrollRef.current
    if (!container || container.clientHeight <= 0) return
    const nearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_THRESHOLD
    const prevScrollTop = lastScrollTopRef.current
    const isScrollingUp = prevScrollTop !== null && prevScrollTop - container.scrollTop > 0.5
    stickToBottomRef.current = isScrollingUp ? false : nearBottom
    lastScrollTopRef.current = container.scrollTop
    setShowScrollToBottom(!nearBottom)
  }

  // 回到底部：恢复吸底并平滑滚动。
  const scrollToBottom = (): void => {
    const container = scrollRef.current
    if (!container) return
    stickToBottomRef.current = true
    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
    setShowScrollToBottom(false)
  }

  if (timeline.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center p-4">
        <p className="text-xs text-white/45">{t("openclaw.conversationEmpty")}</p>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
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

            return (
              <OpenClawMessageItem
                key={message.id}
                agentId={agentId}
                message={message}
                agent={agent}
                targetAgents={targetAgents}
                isStreaming={message.status === "streaming"}
              />
            )
          })}
        </div>
      </div>

      {/* 回到底部悬浮按钮 */}
      {showScrollToBottom && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 -translate-x-1/2">
          <LxIconButton
            shape="circle"
            size="medium"
            aria-label={t("openclaw.scrollToBottom")}
            title={{ content: t("openclaw.scrollToBottom"), placement: "top" }}
            className="pointer-events-auto border border-[var(--color-theme-border-subtle,rgba(255,255,255,0.12))] bg-[var(--color-theme-surface-elevated,#212121)] text-[var(--color-theme-text-secondary,rgba(255,255,255,0.6))] shadow-lg backdrop-blur hover:border-[var(--color-theme-border-hover,rgba(255,255,255,0.25))] hover:bg-[var(--color-theme-surface-hover,#2a2a2a)] hover:text-[var(--color-theme-text-primary,#fff)]"
            onClick={scrollToBottom}
          >
            <ArrowDownToLine />
          </LxIconButton>
        </div>
      )}
    </div>
  )
}
