import type React from "react"
import type { ExecutionToolContent } from "@/features/agent/types"
import { FlowToolRawSection } from "./FlowToolRawSection"

export interface FlowToolGenericProps {
  content: ExecutionToolContent
}

export const FlowToolGeneric = ({ content }: FlowToolGenericProps): React.JSX.Element => {
  return (
    <div className="agent-execution-flow-tool-generic flex flex-col gap-2 font-mono text-xs">
      <FlowToolRawSection
        args={content.args}
        result={content.result}
        isError={content.isError}
        toolCallId={content.toolCallId}
      />
    </div>
  )
}
