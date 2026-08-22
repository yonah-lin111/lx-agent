import type React from "react"
import type { ExecutionToolContent } from "@/features/agent/types"

export interface FlowItemToolTitleProps {
  toolContent: ExecutionToolContent
}

export const FlowItemToolTitle = ({ toolContent }: FlowItemToolTitleProps): React.JSX.Element => {
  const toolName = toolContent.toolName

  if (toolName === "read_skill") {
    const skillName =
      typeof toolContent.args?.name === "string" && toolContent.args.name.trim()
        ? toolContent.args.name.trim()
        : "Skill"
    return (
      <span className="shrink-0 font-mono text-[12px] font-medium text-violet-300">
        {skillName}
      </span>
    )
  }

  if (toolName === "web_search" || toolName === "webfetch") {
    return (
      <span className="shrink-0 font-mono text-[12px] font-medium text-emerald-300">
        {toolName}
      </span>
    )
  }

  if (toolName === "todowrite") {
    return (
      <span className="shrink-0 font-mono text-[12px] font-medium text-orange-300">{toolName}</span>
    )
  }

  if (toolName.includes("_")) {
    const sepIdx = toolName.indexOf("_")
    const serverName = toolName.slice(0, sepIdx)
    const method = toolName.slice(sepIdx + 1)
    return (
      <span className="shrink-0 font-mono text-[12px] font-medium text-cyan-300">
        MCP · {serverName} · {method}
      </span>
    )
  }

  return (
    <span className="shrink-0 font-mono text-[12px] font-medium text-amber-300">{toolName}</span>
  )
}
