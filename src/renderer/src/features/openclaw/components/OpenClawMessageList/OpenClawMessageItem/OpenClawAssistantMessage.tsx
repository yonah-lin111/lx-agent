import { Check, Copy, Trash2 } from "lucide-react"
import type React from "react"
import { useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ConversationAgent } from "./types"

export interface OpenClawAssistantMessageProps {
  agentId: string
  content: string
  error?: string
  agent?: ConversationAgent
  isStreaming?: boolean
  // 该条消息生成时的模型（历史水合与 run 结束回填；未记录时不渲染）。
  model?: string
  // 删除该消息所在的一轮问答（由列表仅对最后一条非流式 AI 消息传入）。
  onDelete?: () => void
}

export const OpenClawAssistantMessage = ({
  agentId,
  content,
  error,
  agent,
  isStreaming = false,
  model,
  onDelete,
}: OpenClawAssistantMessageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLElement | null>(null)
  const [copied, setCopied] = useState(false)
  const agentName = agent?.name ?? agentId

  const copyMessageContent = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(content || error || "")
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="group flex min-w-0 w-full flex-col gap-1.5 px-0">
      <div className="flex w-fit items-center gap-1.5 px-1 leading-none">
        <span
          className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-semibold text-black/90 shadow-sm"
          style={{ backgroundColor: agent?.accent ?? "#4ecdc4" }}
        >
          {(agent?.name ?? agentId).slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[12px] font-medium text-white/70">{agentName}</span>
        {model ? <span className="shrink-0 text-white/35">{model}</span> : null}
      </div>

      <div
        data-assistant-bubble="true"
        className="relative min-w-0 max-w-full rounded-[18px] rounded-bl-[4px] bg-[#303030] px-3.5 py-2.5 text-[13px] text-white/90 shadow-sm"
      >
        {content ? (
          <LxMarkdownPreview
            html={markdownRenderer.render(content)}
            previewMode="preview"
            previewRef={previewRef}
            className="px-0"
            contentClassName="py-0"
            sanitizeCopy
          />
        ) : isStreaming ? (
          <div className="flex items-center gap-1.5 py-1 text-white/40">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          </div>
        ) : null}

        {isStreaming && content ? (
          <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-sky-400/80 ml-1" />
        ) : null}

        {error ? <div className="mt-1 text-xs text-rose-300">{error}</div> : null}
      </div>

      {!isStreaming && (content || error) ? (
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
          {onDelete ? (
            <LxTooltip
              hover={{ content: t("openclaw.deleteTurn"), placement: "top" }}
              click={{
                content: t("openclaw.deleteTurnConfirm", { name: agentName }),
                placement: "top",
                onConfirm: onDelete,
              }}
            >
              <LxIconButton size="small" aria-label={t("openclaw.deleteTurn")}>
                <Trash2 />
              </LxIconButton>
            </LxTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
