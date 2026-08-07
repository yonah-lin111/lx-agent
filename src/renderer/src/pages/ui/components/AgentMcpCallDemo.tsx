import type React from "react"

import { AgentMcpCallBlock, type ChatBlock } from "@/features/agent"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 同一 MCP 服务连续执行的工具调用。
const MCP_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "mcp-1",
    toolName: "github_get_issue",
    args: { owner: "lx-agent", repo: "lx-agent" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "mcp-2",
    toolName: "github_get_issue",
    args: { owner: "lx-agent", repo: "lx-agent" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "mcp-3",
    toolName: "github_list_issues",
    args: { owner: "lx-agent", repo: "lx-agent" },
    status: "done",
  },
]

/**
 * 预览 AgentMcpCallBlock 组件。
 */
export const AgentMcpCallDemo = (): React.JSX.Element => (
  <div className="flex w-full flex-col gap-4">
    <UiPreviewSection
      title="MCP 工具调用"
      description="服务名 + 连续同名工具方法合并摘要，不展示调用内容"
    >
      <div className="flex max-w-lg flex-col">
        <AgentMcpCallBlock toolCalls={MCP_CALLS} />
      </div>
    </UiPreviewSection>
  </div>
)
