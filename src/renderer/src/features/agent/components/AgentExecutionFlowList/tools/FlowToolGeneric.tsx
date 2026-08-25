import { FileText, Terminal } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatDurationMs, formatJsonString } from "../types"

export interface FlowToolGenericProps {
  content: ExecutionToolContent
}

export const FlowToolGeneric = ({ content }: FlowToolGenericProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-tool-generic flex flex-col gap-2 font-mono text-[11px]">
      {/* 参数 */}
      <div>
        <div className="mb-1 flex items-center justify-between text-white/45">
          <span className="flex items-center gap-1">
            <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
          </span>
          <div className="flex items-center gap-2">
            {content.durationMs !== undefined && (
              <LxTag size="small" color="default">
                <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
              </LxTag>
            )}
            {content.toolCallId && (
              <span className="text-[10px] text-white/30">ID: {content.toolCallId}</span>
            )}
          </div>
        </div>
        <div className="custom-scrollbar max-h-48 overflow-y-auto rounded bg-black/40 p-2 text-sky-200/90 break-all whitespace-pre-wrap">
          {formatJsonString(content.args)}
        </div>
      </div>

      {/* 结果 */}
      {content.result !== undefined && (
        <div>
          <div className="mb-1 flex items-center justify-between text-white/45">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
            {content.isError && (
              <span className="text-[10px] text-rose-400 font-medium">ERROR</span>
            )}
          </div>
          <div
            className={`custom-scrollbar max-h-60 overflow-y-auto rounded p-2 leading-relaxed break-all whitespace-pre-wrap ${
              content.isError
                ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            {content.result || <span className="text-white/30">-</span>}
          </div>
        </div>
      )}
    </div>
  )
}
