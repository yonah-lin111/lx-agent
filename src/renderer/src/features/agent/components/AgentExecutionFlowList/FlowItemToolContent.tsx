import type React from "react"
import { AgentVisualBlock } from "@/features/agent/components/blocks"
import type { ExecutionToolContent } from "@/features/agent/types"
import { FlowToolBash } from "./tools/FlowToolBash"
import { FlowToolFileOps } from "./tools/FlowToolFileOps"
import { FlowToolGeneric } from "./tools/FlowToolGeneric"
import { FlowToolSearch } from "./tools/FlowToolSearch"

export interface FlowItemToolContentProps {
  content: ExecutionToolContent
}

export const FlowItemToolContent = ({ content }: FlowItemToolContentProps): React.JSX.Element => {
  const toolName = content.toolName

  if (toolName === "render_svg" || toolName === "render_ascii" || toolName === "render_html") {
    return (
      <div
        className="min-w-0"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <AgentVisualBlock
          toolCall={{
            kind: "toolCall",
            toolCallId: content.toolCallId || "",
            toolName: content.toolName,
            args: content.args || {},
            status: content.isError ? "error" : "done",
          }}
        />
      </div>
    )
  }

  if (toolName === "bash") {
    return <FlowToolBash content={content} />
  }

  if (toolName === "read" || toolName === "write" || toolName === "edit") {
    return <FlowToolFileOps content={content} />
  }

  if (toolName === "grep" || toolName === "glob" || toolName === "lsp") {
    return <FlowToolSearch content={content} />
  }

  return <FlowToolGeneric content={content} />
}
