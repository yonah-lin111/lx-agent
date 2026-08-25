import { Terminal } from "lucide-react"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatDurationMs } from "../types"

export interface FlowToolBashProps {
  content: ExecutionToolContent
}

export const FlowToolBash = ({ content }: FlowToolBashProps): React.JSX.Element => {
  const { t } = useTranslation()
  const command =
    typeof content.args?.command === "string"
      ? content.args.command
      : String(content.args?.command ?? "")
  const timeout = typeof content.args?.timeout === "number" ? content.args.timeout : undefined
  const background = Boolean(content.args?.background)

  return (
    <div className="agent-execution-flow-tool-bash flex flex-col gap-2 font-mono">
      {/* 终端命令行窗格 */}
      <div className="rounded border border-white/10 bg-black/60 p-2.5">
        <div className="flex items-start gap-2 text-[12px] text-emerald-300">
          <span className="shrink-0 select-none text-white/40">$</span>
          <FlowItemExpandableText content={command} maxLines={3} />
        </div>
      </div>

      {/* 参数与状态徽标 */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {content.durationMs !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
          </LxTag>
        )}
        {timeout !== undefined && (
          <LxTag size="small" color="default">
            <span className="text-white/60">timeout: {timeout}s</span>
          </LxTag>
        )}
        {background && (
          <LxTag size="small" color="purple">
            <span className="text-purple-300">background job</span>
          </LxTag>
        )}
        {content.isError && (
          <LxTag size="small" color="rose">
            <span className="text-rose-300">exit error</span>
          </LxTag>
        )}
      </div>

      {/* 输出结果 */}
      {content.result !== undefined && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-white/45">
            <span className="flex items-center gap-1">
              <Terminal className="h-3 w-3" /> {t("agent.toolResult")}
            </span>
          </div>
          <div
            className={`rounded p-2.5 text-[11px] ${
              content.isError
                ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                : "bg-black/40 text-white/80"
            }`}
          >
            <FlowItemExpandableText
              content={content.result}
              fallbackText="(无输出)"
              maxLines={3}
            />
          </div>
        </div>
      )}
    </div>
  )
}
