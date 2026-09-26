import { ChevronDown, ChevronRight, Loader2, MessageCircleQuestion, User } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { AgentUserMessage } from "@/features/agent/components/AgentMessageList/AgentMessageItem/AgentUserMessage"
import type { BtwMessage } from "@/features/agent/hooks/btwStore"
import type { ChatMessage } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

interface AgentBtwMessageProps {
  message: BtwMessage
  // flow 视图模式：问答切换为执行流步骤卡片外观，与主界面 flow 视觉一致。
  viewMode: "qa" | "flow"
}

// btw 问题转为只读 ChatMessage，复用主会话用户消息组件（气泡样式/主题对齐，禁用编辑删除）。
const toReadOnlyUserMessage = (message: BtwMessage): ChatMessage => ({
  id: message.id,
  role: "user",
  blocks: [{ kind: "text", text: message.content }],
  isStreaming: false,
  timestamp: message.createdAt,
})

// flow 模式下的单条问答卡片：琥珀/绿宝石方块外框 + 步骤头部，与执行流步骤同构。
const BtwFlowMessage = ({
  message,
  role,
  label,
}: {
  message: BtwMessage
  role: "user" | "assistant"
  label: string
}): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(true)
  const icon =
    role === "user" ? (
      <User className="h-3.5 w-3.5" />
    ) : (
      <MessageCircleQuestion className="h-3.5 w-3.5" />
    )

  return (
    <div
      className={`agent-btw-flow-step agent-btw-flow-step--${role} rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.06))] transition-colors`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setIsExpanded((prev) => !prev)
          }
        }}
        className="agent-btw-flow-step-header flex h-8 cursor-pointer items-center gap-1.5 px-2.5 text-xs select-none hover:bg-white/[0.02]"
      >
        <span className="flex shrink-0 items-center text-[var(--color-theme-text-muted,rgba(255,255,255,0.4))]">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className={`shrink-0 ${role === "user" ? "text-amber-300" : "text-emerald-300"}`}>
          {icon}
        </span>
        <span className="truncate font-mono text-xs font-medium leading-none">{label}</span>
      </div>
      {isExpanded && (
        <div className="agent-btw-flow-step-body border-t border-white/5 px-3 py-2.5 text-xs">
          {role === "assistant" ? (
            <LxMarkdownPreview
              html={renderMarkdown(message.content)}
              previewMode="preview"
              className="px-0"
              contentClassName="py-0 leading-relaxed text-white/90"
              sanitizeCopy
            />
          ) : (
            <div className="whitespace-pre-wrap break-words leading-relaxed text-white/90">
              {message.content}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * AgentBtwMessage - btw 侧问单条消息渲染：
 * qa 模式复用主会话用户/助手气泡类名（主题/像素风格自动对齐），flow 模式切换为执行流步骤卡片。
 */
export const AgentBtwMessage = ({ message, viewMode }: AgentBtwMessageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const isUser = message.role === "user"

  if (viewMode === "flow") {
    return (
      <BtwFlowMessage
        message={message}
        role={message.role}
        label={isUser ? t("agent.btwQuestion") : t("agent.btwAnswer")}
      />
    )
  }

  if (isUser) {
    return <AgentUserMessage message={toReadOnlyUserMessage(message)} readOnly />
  }

  if (message.failed) {
    return <div className="agent-btw-failed px-1 text-sm text-rose-300/90">{message.content}</div>
  }

  return (
    <div className="flex min-w-0 w-full flex-col px-0">
      <div
        data-assistant-bubble="true"
        className="relative min-w-0 w-full rounded-[18px] rounded-bl-[4px] bg-[var(--color-btw-assistant-bubble,#303030)] px-3 py-2 text-sm text-white/90"
      >
        <LxMarkdownPreview
          html={renderMarkdown(message.content)}
          previewMode="preview"
          className="px-0"
          contentClassName="py-1"
          sanitizeCopy
        />
      </div>
    </div>
  )
}

// btw 等待回答的 spinner 行。
export const AgentBtwThinking = (): React.JSX.Element => {
  const { t } = useTranslation()
  return (
    <div className="agent-btw-thinking flex items-center gap-1.5 self-start px-1 text-xs text-white/45">
      <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      <span>{t("agent.btwThinking")}</span>
    </div>
  )
}
