import { Sparkles } from "lucide-react"
import type React from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ExecutionModelSwitchContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemModelSwitchContentProps {
  content: ExecutionModelSwitchContent
  previewRef?: React.RefObject<HTMLElement | null>
}

export const FlowItemModelSwitchContent = ({
  content,
  previewRef,
}: FlowItemModelSwitchContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-model-switch-content flex flex-col gap-2 font-mono text-[11px] text-white/70">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">Model:</span>
          <span className="font-semibold text-cyan-300">
            {content.model || "(Unknown model)"}
          </span>
        </div>
        {content.provider && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Provider:</span>
            <span className="text-white/80">{content.provider}</span>
          </div>
        )}
        {content.family && (
          <div className="flex items-center gap-1.5">
            <span className="text-white/40">Family:</span>
            <span className="text-cyan-400/90 capitalize">{content.family}</span>
          </div>
        )}
      </div>

      {content.instructions ? (
        <div className="mt-1 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-cyan-300/80 uppercase">
            <Sparkles className="h-3 w-3" />
            <span>{t("agent.vendorPrompt")}</span>
          </div>
          <div className="custom-scrollbar max-h-60 overflow-y-auto rounded bg-black/40 p-2.5">
            <LxMarkdownPreview
              html={markdownRenderer.render(content.instructions)}
              previewMode="preview"
              previewRef={previewRef}
              className="px-0"
              contentClassName="py-0 text-white/70 [&_*]:!text-white/70 [&_h2]:text-cyan-300/90 [&_h3]:text-cyan-300/80"
              sanitizeCopy
            />
          </div>
        </div>
      ) : (
        <div className="italic text-white/35">
          {t("agent.noVendorPrompt")}
        </div>
      )}
    </div>
  )
}
