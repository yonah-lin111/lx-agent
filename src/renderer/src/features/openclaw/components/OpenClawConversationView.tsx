import type React from "react"
import { useEffect, useMemo, useRef } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { useTranslation } from "@/i18n"
import type { OfficeTimelineMessage } from "../hooks/useOpenClawOffice"

export interface ConversationAgent {
  agentId: string
  name: string
  accent: string
}

export interface OpenClawConversationViewProps {
  timeline: OfficeTimelineMessage[]
  agents: ConversationAgent[]
  streamingAgentIds: string[]
}

// 单条助手消息：独立持有预览引用，复用项目 Markdown 渲染链路。
const AssistantMessage = ({ content }: { content: string }): React.JSX.Element => {
  const previewRef = useRef<HTMLElement | null>(null)
  return (
    <div className="max-w-full rounded-[10px] border border-white/6 bg-white/[0.03] px-3 py-2">
      <LxMarkdownPreview
        html={markdownRenderer.render(content)}
        previewMode="preview"
        previewRef={previewRef}
        className="px-0"
        contentClassName="py-0"
      />
    </div>
  )
}

/**
 * 对话模式视图：将当前办公区内所有员工的消息交错渲染为单一时间线。
 *
 * 注意：仅为视觉合并，底层各 Agent 会话上下文互不相通。
 */
export const OpenClawConversationView = ({
  timeline,
  agents,
  streamingAgentIds,
}: OpenClawConversationViewProps): React.JSX.Element => {
  const { t } = useTranslation()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastMessage = timeline[timeline.length - 1]

  const agentMap = useMemo(() => new Map(agents.map((agent) => [agent.agentId, agent])), [agents])

  // 新消息或流式增量时滚动到底部。
  const scrollSignal = `${timeline.length}:${lastMessage?.message.content.length ?? 0}`
  useEffect(() => {
    const container = scrollRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [scrollSignal])

  const renderMessage = (item: OfficeTimelineMessage): React.JSX.Element => {
    const { agentId, message } = item
    const agent = agentMap.get(agentId)

    if (message.role === "user") {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-white/85">
            {message.content}
          </div>
        </div>
      )
    }

    if (message.role === "system") {
      const text =
        message.code === "approval-required"
          ? `${t("openclaw.approvalRequired")}${
              message.content ? ` (requestId: ${message.content})` : ""
            }`
          : message.content
      return (
        <div
          key={message.id}
          className="rounded-[8px] border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200/80"
        >
          {text}
        </div>
      )
    }

    return (
      <div key={message.id} className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 px-1">
          <span
            className="flex h-4 w-4 items-center justify-center rounded-[3px] text-[9px] font-medium text-black/80"
            style={{ backgroundColor: agent?.accent ?? "#4ecdc4" }}
          >
            {(agent?.name ?? agentId).slice(0, 1).toUpperCase()}
          </span>
          <span className="text-[11px] text-white/50">{agent?.name ?? agentId}</span>
        </div>
        <AssistantMessage content={message.content} />
        {message.status === "error" && message.error ? (
          <span className="px-1 text-[11px] text-rose-300">{message.error}</span>
        ) : null}
      </div>
    )
  }

  if (timeline.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-xs text-white/45">{t("openclaw.conversationEmpty")}</p>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        {timeline.map(renderMessage)}
        {streamingAgentIds.length > 0 ? (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-white/40">
            <span className="flex gap-0.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
            {t("openclaw.workingCount", { count: streamingAgentIds.length })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
