import type React from "react"
import { useTranslation } from "@/i18n"
import { OpenClawAssistantMessage } from "./OpenClawAssistantMessage"
import { OpenClawUserMessage } from "./OpenClawUserMessage"
import type { OpenClawMessageItemProps } from "./types"

export const OpenClawMessageItem = ({
  agentId,
  message,
  agent,
  targetAgents,
  isStreaming = false,
}: OpenClawMessageItemProps): React.JSX.Element => {
  const { t } = useTranslation()

  if (message.role === "user") {
    return <OpenClawUserMessage content={message.content} targetAgents={targetAgents} />
  }

  if (message.role === "system") {
    const text =
      message.code === "approval-required"
        ? `${t("openclaw.approvalRequired")}${
            message.content ? ` (requestId: ${message.content})` : ""
          }`
        : message.content
    return (
      <div className="rounded-[8px] border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-[12px] text-amber-200/90 shadow-sm">
        {text}
      </div>
    )
  }

  return (
    <OpenClawAssistantMessage
      agentId={agentId}
      content={message.content}
      error={message.status === "error" ? message.error : undefined}
      agent={agent}
      isStreaming={isStreaming}
    />
  )
}
