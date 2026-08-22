import { FileCode } from "lucide-react"
import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
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

  return (
    <div className="agent-execution-flow-user-content flex flex-col gap-2">
      {content.isSteer && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-mono text-sky-300">
            {t("agent.steerMessage")}
          </span>
        </div>
      )}
      {content.text ? (
        <LxMarkdownPreview
          html={markdownRenderer.render(content.text)}
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
          <div className="flex flex-wrap gap-1">
            {content.files.map((file) => (
              <span
                key={file.path}
                className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 text-[11px] text-white/60"
              >
                <FileCode className="h-3 w-3" />
                {file.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
