import { Sparkles } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { getModelDisplayName, useModelSettings } from "@/features/agent/hooks/modelsStore"
import type { ExecutionModelSwitchContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemModelSwitchContentProps {
  content: ExecutionModelSwitchContent
}

export const FlowItemModelSwitchContent = ({
  content,
}: FlowItemModelSwitchContentProps): React.JSX.Element => {
  const { t } = useTranslation()
  const settings = useModelSettings()
  const modelDisplayName = getModelDisplayName(content.model, content.provider, settings)

  return (
    <div className="agent-execution-flow-model-switch-content flex flex-col gap-2 font-mono text-xs text-white/70">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">Model:</span>
          {content.model && content.model !== modelDisplayName ? (
            <LxTooltip placement="top" content={content.model}>
              <span className="font-semibold text-cyan-300">{modelDisplayName}</span>
            </LxTooltip>
          ) : (
            <span className="font-semibold text-cyan-300">
              {modelDisplayName || "(Unknown model)"}
            </span>
          )}
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
          <div className="flex items-center gap-1 text-xs font-semibold tracking-wider text-cyan-300/80 uppercase">
            <Sparkles className="h-3 w-3" />
            <span>{t("agent.vendorPrompt")}</span>
          </div>
          {/* 厂商自适应提示词为 XML 结构：按原文展示，不做 markdown 渲染（避免未知标签被清洗吞掉） */}
          <div className="custom-scrollbar max-h-60 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-2.5 font-mono text-xs leading-relaxed text-white/70">
            {content.instructions}
          </div>
        </div>
      ) : (
        <div className="italic text-white/35">{t("agent.noVendorPrompt")}</div>
      )}
    </div>
  )
}
