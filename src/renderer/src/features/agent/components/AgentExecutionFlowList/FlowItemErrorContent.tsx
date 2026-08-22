import type React from "react"
import type { ExecutionErrorContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface FlowItemErrorContentProps {
  content: ExecutionErrorContent
  fallbackTitle: string
}

export const FlowItemErrorContent = ({
  content,
  fallbackTitle,
}: FlowItemErrorContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-error-content flex flex-col gap-2">
      <div
        className={`custom-scrollbar max-h-60 overflow-y-auto rounded p-2 font-mono text-[11px] leading-relaxed ${
          content.isAborted
            ? "border border-amber-500/20 bg-amber-950/20 text-amber-200"
            : "border border-red-500/20 bg-red-950/20 text-red-200"
        }`}
      >
        {content.message || <span className="text-white/30">{fallbackTitle}</span>}
      </div>
      {content.stopReason && (
        <div className="flex items-center gap-2 border-t border-white/5 pt-1.5 font-mono text-[11px] text-white/40">
          <span>
            {t("agent.stopReason")}: {content.stopReason}
          </span>
        </div>
      )}
    </div>
  )
}
