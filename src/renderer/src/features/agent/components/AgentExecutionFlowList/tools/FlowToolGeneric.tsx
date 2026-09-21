import type React from "react"
import type { ExecutionToolContent } from "@/features/agent/types"
import { FlowToolArgsSection, FlowToolResultSection } from "./FlowToolSections"

export interface FlowToolGenericProps {
  content: ExecutionToolContent
}

export const FlowToolGeneric = ({ content }: FlowToolGenericProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-tool-generic flex flex-col gap-2 font-mono text-xs">
      {content.result !== undefined && (
        <FlowToolResultSection result={content.result} isError={content.isError} />
      )}

      <FlowToolArgsSection args={content.args} toolCallId={content.toolCallId} />
    </div>
  )
}
