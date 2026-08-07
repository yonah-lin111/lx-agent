import type React from "react"

import {
  AgentExecutionGroup,
  AgentMcpCallBlock,
  AgentThinkingBlock,
  AgentToolCallBlock,
  type ChatBlock,
} from "@/features/agent"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>
type ToolResultBlock = Extract<ChatBlock, { kind: "toolResult" }>

// 单次内置工具调用与结果。
const READ_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "read-1",
  toolName: "read",
  args: { path: "src/renderer/src/App.tsx" },
  status: "done",
}

const READ_RESULT: ToolResultBlock = {
  kind: "toolResult",
  toolCallId: "read-1",
  toolName: "read",
  text: 'import { useEffect, useState } from "react"\nimport { LeftSideBar } from "@/components/layout/LeftSideBar"',
  isError: false,
}

const BASH_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "bash-1",
  toolName: "bash",
  args: { command: "pnpm typecheck" },
  status: "running",
}

const GREP_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "grep-1",
  toolName: "grep",
  args: { pattern: "PAGE_ROUTES", path: "src/renderer/src/lib" },
  status: "done",
}

// 连续读取的同名工具调用。
const READ_GROUP_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "read-2",
    toolName: "read",
    args: { path: "src/renderer/src/App.tsx" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "read-3",
    toolName: "read",
    args: { path: "src/renderer/src/lib/pageRoutes.ts" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "read-4",
    toolName: "read",
    args: { path: "src/renderer/src/pages/ui/index.tsx" },
    status: "done",
  },
]

// 同一 MCP 服务连续执行的调用。
const MCP_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "mcp-1",
    toolName: "github_get_issue",
    args: { owner: "lx-agent" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "mcp-2",
    toolName: "github_list_issues",
    args: { owner: "lx-agent" },
    status: "done",
  },
]

/**
 * 预览 AgentToolCallBlock 组件。
 */
export const AgentToolCallDemo = (): React.JSX.Element => (
  <div className="flex w-full flex-col gap-4">
    <UiPreviewSection title="单次工具调用" description="read / bash / grep 摘要与工具结果展示">
      <div className="flex max-w-lg flex-col">
        <AgentToolCallBlock toolCall={READ_CALL} toolResult={READ_RESULT} />
        <AgentToolCallBlock toolCall={BASH_CALL} />
        <AgentToolCallBlock toolCall={GREP_CALL} />
      </div>
    </UiPreviewSection>
    <UiPreviewSection title="工具调用组" description="连续同名调用合并为单行摘要，数量 ≥2 时折叠">
      <div className="flex max-w-lg flex-col">
        <AgentExecutionGroup toolCount={3} thinkingCount={0} mcpCount={0}>
          <AgentToolCallBlock toolCalls={READ_GROUP_CALLS} />
        </AgentExecutionGroup>
      </div>
    </UiPreviewSection>
    <UiPreviewSection
      title="工具 + 思考折叠组"
      description="思考块与工具调用合并折叠，展示英文计数"
    >
      <div className="flex max-w-lg flex-col">
        <AgentExecutionGroup toolCount={2} thinkingCount={1} mcpCount={0}>
          <AgentThinkingBlock content="用户询问组件折叠方式，需要先梳理 Agent 消息块结构，再确认思考与工具调用的合并策略。" />
          <AgentToolCallBlock toolCall={READ_CALL} />
          <AgentToolCallBlock toolCall={BASH_CALL} />
        </AgentExecutionGroup>
      </div>
    </UiPreviewSection>
    <UiPreviewSection
      title="工具 + 思考 + MCP 折叠组"
      description="MCP 调用并入执行组折叠，展示三类英文计数"
    >
      <div className="flex max-w-lg flex-col">
        <AgentExecutionGroup toolCount={1} thinkingCount={1} mcpCount={2}>
          <AgentThinkingBlock content="需要调用 MCP 服务获取仓库信息，先确认服务与工具方法名。" />
          <AgentToolCallBlock toolCall={GREP_CALL} />
          <AgentMcpCallBlock toolCalls={MCP_CALLS} />
        </AgentExecutionGroup>
      </div>
    </UiPreviewSection>
  </div>
)
