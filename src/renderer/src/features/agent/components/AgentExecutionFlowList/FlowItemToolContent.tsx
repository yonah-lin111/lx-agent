import type React from "react"
import type { ExecutionToolContent } from "@/features/agent/types"
import { FlowToolBash } from "./tools/FlowToolBash"
import { FlowToolFileOps } from "./tools/FlowToolFileOps"
import { FlowToolGeneric } from "./tools/FlowToolGeneric"
import { FlowToolSearch } from "./tools/FlowToolSearch"
import { FlowToolVisual } from "./tools/FlowToolVisual"

export interface FlowItemToolContentProps {
  content: ExecutionToolContent
}

export const FlowItemToolContent = ({ content }: FlowItemToolContentProps): React.JSX.Element => {
  const toolName = content.toolName

  if (toolName === "render_svg" || toolName === "render_ascii" || toolName === "render_html") {
    return <FlowToolVisual content={content} />
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
