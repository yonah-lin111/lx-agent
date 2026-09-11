import type React from "react"
import { useTranslation } from "@/i18n"
import type { ConversationAgent } from "./types"

export interface OpenClawUserMessageProps {
  content: string
  targetAgents?: ConversationAgent[]
}

export const OpenClawUserMessage = ({
  content,
  targetAgents = [],
}: OpenClawUserMessageProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-end gap-1.5">
      {targetAgents.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-1 px-1">
          <span className="text-[11px] text-white/40">{t("openclaw.targetLabel")}</span>
          {targetAgents.map((agent) => (
            <span
              key={agent.agentId}
              className="inline-flex items-center gap-1 rounded-[4px] border border-white/10 bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/80"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: agent.accent || "#38bdf8" }}
              />
              @{agent.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[4px] border border-sky-400/20 bg-sky-400/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 shadow-sm">
        {content}
      </div>
    </div>
  )
}
