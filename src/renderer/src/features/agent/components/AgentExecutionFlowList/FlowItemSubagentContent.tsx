import type React from "react"
import type { ExecutionSubagentContent } from "@/features/agent/types"

export interface FlowItemSubagentContentProps {
  content: ExecutionSubagentContent
}

export const FlowItemSubagentContent = ({
  content,
}: FlowItemSubagentContentProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-subagent-content flex flex-col gap-2 font-mono text-[11px]">
      <div className="flex items-center gap-2 text-white/70">
        <span className="text-white/40">Task:</span>
        <span className="font-bold text-blue-300">{content.name}</span>
      </div>
      {content.subagent?.prompt && (
        <div className="rounded bg-black/30 p-2 text-white/80">
          <div className="text-[10px] text-white/40 mb-0.5">Prompt:</div>
          <div className="whitespace-pre-wrap">{content.subagent.prompt}</div>
        </div>
      )}
      {content.subagent?.description && (
        <div className="text-white/50">{content.subagent.description}</div>
      )}
      {content.subagent?.usage && (
        <div className="flex gap-3 text-white/40 pt-1">
          <span>Input: {content.subagent.usage.input}</span>
          <span>Output: {content.subagent.usage.output}</span>
          <span>Total: {content.subagent.usage.totalTokens}</span>
        </div>
      )}
    </div>
  )
}
