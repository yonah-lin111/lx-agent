import { CornerDownRight, Server } from "lucide-react"
import type React from "react"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// MCP 工具调用展示组件属性类型。
type AgentMcpCallBlockProps = {
  // 同一 MCP 服务连续执行的工具调用。
  toolCalls: ToolCallBlock[]
}

// 将 MCP 工具全名 `server_tool` 拆分为服务名与工具方法名。
const splitMcpToolName = (name: string): { serverName: string; toolName: string } => {
  const separatorIndex = name.indexOf("_")
  if (separatorIndex <= 0) return { serverName: name, toolName: name }
  return {
    serverName: name.slice(0, separatorIndex),
    toolName: name.slice(separatorIndex + 1),
  }
}

// 将连续的同名 MCP 工具调用合并为摘要行，工具方法以「名称」包裹，逗号分隔（末项无逗号）。
const buildMcpGroupRows = (toolCalls: ToolCallBlock[]): string[] => {
  const rows: string[] = []
  let lastToolName: string | null = null
  let currentEntries: string[] = []

  const flush = (): void => {
    if (currentEntries.length > 0) {
      rows.push(currentEntries.map((name) => `「${name}」`).join(","))
      currentEntries = []
    }
  }

  for (const call of toolCalls) {
    const { toolName } = splitMcpToolName(call.toolName)
    if (lastToolName !== null && lastToolName !== call.toolName) {
      flush()
    }
    currentEntries.push(toolName)
    lastToolName = call.toolName
  }
  flush()

  return rows
}

/**
 * AgentMcpCallBlock - 渲染 MCP 工具调用（服务名 + 连续同名工具方法合并摘要），不展示调用内容，不参与普通工具折叠。
 */
export const AgentMcpCallBlock = ({
  toolCalls,
}: AgentMcpCallBlockProps): React.JSX.Element | null => {
  if (toolCalls.length === 0) {
    return null
  }

  const serverName = splitMcpToolName(toolCalls[0]!.toolName).serverName
  const groupRows = buildMcpGroupRows(toolCalls)

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <Server className="h-3.5 w-3.5 shrink-0 text-cyan-300" />
        <span className="font-mono text-[12px] font-bold text-cyan-300">MCP · {serverName}</span>
      </div>
      <div className="mt-1 flex min-w-0 flex-col gap-1 pl-1">
        {groupRows.map((row, index) => (
          <div
            key={index}
            className="flex min-w-0 items-start gap-1 text-[12px] leading-relaxed text-white/45"
          >
            <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
            <span className="min-w-0 break-all font-mono">{row}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
