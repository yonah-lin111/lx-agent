import { Check, Copy } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
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
  const [copied, setCopied] = useState(false)

  const copyMessageContent = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group flex flex-col items-end gap-1.5">
      {targetAgents.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5 px-1 leading-none">
          <span className="text-[11px] text-white/40">{t("openclaw.targetLabel")}</span>
          {targetAgents.map((agent) => (
            <span
              key={agent.agentId}
              className="openclaw-target-agent-tag inline-flex items-center gap-1 rounded-[var(--theme-radius-base,4px)] border border-[var(--color-theme-border-strong,rgba(255,255,255,0.12))] bg-[var(--color-theme-surface,rgba(255,255,255,0.06))] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-theme-text,#ffffff)]/80"
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
      <div
        data-user-bubble="true"
        className="openclaw-user-bubble bg-user-bubble max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[4px] bg-[#253347] px-3.5 py-2.5 text-[13px] leading-relaxed text-white/90 shadow-sm"
      >
        {content}
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <LxIconButton
          size="small"
          aria-label={t("openclaw.copyMessage")}
          title={{
            content: copied ? t("common.copied") : t("openclaw.copyMessage"),
            placement: "top",
          }}
          onClick={copyMessageContent}
        >
          {copied ? <Check className="text-emerald-400" /> : <Copy />}
        </LxIconButton>
      </div>
    </div>
  )
}
