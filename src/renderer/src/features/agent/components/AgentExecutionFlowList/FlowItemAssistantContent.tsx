import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionAssistantContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemAssistantContentProps {
  content: ExecutionAssistantContent
  previewRef: React.RefObject<HTMLDivElement | null>
}

export const FlowItemAssistantContent = ({
  content,
  previewRef,
}: FlowItemAssistantContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-assistant-content flex flex-col gap-2 font-sans text-white/90">
      <LxMarkdownPreview
        html={markdownRenderer.render(content.text)}
        previewMode="preview"
        previewRef={previewRef}
        className="px-0"
        contentClassName="py-0 leading-relaxed text-white/90"
        sanitizeCopy
      />
      {(content.model || content.usage) && (
        <div className="flex flex-wrap items-center gap-3 border-t border-white/5 pt-1.5 font-mono text-[11px] text-white/40">
          {content.model && <span>{content.model}</span>}
          {content.stopReason && (
            <span>
              {t("agent.stopReason")}: {content.stopReason}
            </span>
          )}
          {content.usage && (
            <span>
              {content.usage.input} in / {content.usage.output} out
            </span>
          )}
          {content.usage?.cacheRead ? (
            <span className="text-sky-300/80">
              {t("agent.cacheReadTokens", {
                count: content.usage.cacheRead,
              })}
            </span>
          ) : null}
        </div>
      )}
    </div>
  )
}
