import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionToolContent } from "@/features/agent/types"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatDurationMs } from "../types"
import { FlowToolRawSection } from "./FlowToolRawSection"

export interface FlowToolBashProps {
  content: ExecutionToolContent
}

export const FlowToolBash = ({ content }: FlowToolBashProps): React.JSX.Element => {
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
        <div className="flex items-start gap-2 text-xs text-emerald-300">
          <span className="shrink-0 select-none text-white/40">$</span>
          <FlowItemExpandableText content={command} maxLines={3} />
        </div>
      </div>

      {/* 参数与状态徽标 */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
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

      {/* 原始参数与执行结果（默认折叠在底部） */}
      <FlowToolRawSection
        args={content.args}
        result={content.result}
        isError={content.isError}
        toolCallId={content.toolCallId}
      />
    </div>
  )
}
