import type React from "react"
import { useMemo } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { AgentMessageFiles } from "@/features/agent/components/AgentMessageList"
import { cleanUserPrompt } from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import type { ExecutionUserContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemUserContentProps {
  content: ExecutionUserContent
  previewRef: React.RefObject<HTMLDivElement | null>
}

export const FlowItemUserContent = ({
  content,
  previewRef,
}: FlowItemUserContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  const cleanText = useMemo(
    () =>
      cleanUserPrompt(content.text, {
        isSteer: content.isSteer,
        command: content.command,
      }),
    [content.text, content.isSteer, content.command],
  )

  return (
    <div className="agent-execution-flow-user-content flex flex-col gap-2">
      {cleanText ? (
        <LxMarkdownPreview
          html={markdownRenderer.render(cleanText)}
          previewMode="preview"
          previewRef={previewRef}
          className="px-0"
          contentClassName="py-0 leading-relaxed text-white/90"
          sanitizeCopy
        />
      ) : (
        <div className="font-sans text-white/30">{t("agent.emptyPrompt")}</div>
      )}
      {content.files && content.files.length > 0 && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="text-[11px] font-mono text-white/40">{t("agent.attachedFiles")}:</div>
          <AgentMessageFiles files={content.files} align="left" className="mb-0" />
        </div>
      )}
    </div>
  )
}
