import type React from "react"

import {
  AgentExecutionGroup,
  AgentMcpCallBlock,
  AgentThinkingBlock,
  AgentToolCallBlock,
  AgentWebSearchBlock,
  type ChatBlock,
} from "@/features/agent"
import { useTranslation } from "@/i18n"
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

// 连续执行的联网搜索调用。
const WEB_SEARCH_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "ws-1",
    toolName: "web_search",
    args: { query: "lucide-react icon list" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "ws-2",
    toolName: "web_search",
    args: { query: "tailwind v4 release" },
    status: "done",
  },
]

/**
 * 预览 AgentToolCallBlock 组件。
 */
export const AgentToolCallDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.agentToolCallSingle")}
        description={t("uiPreview.demos.agentToolCallSingleDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentToolCallBlock toolCall={READ_CALL} toolResult={READ_RESULT} />
          <AgentToolCallBlock toolCall={BASH_CALL} />
          <AgentToolCallBlock toolCall={GREP_CALL} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.agentToolCallGroup")}
        description={t("uiPreview.demos.agentToolCallGroupDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentExecutionGroup
            items={[
              {
                type: "tool",
                dotColor: "bg-amber-300",
                node: <AgentToolCallBlock toolCalls={READ_GROUP_CALLS} />,
              },
            ]}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.agentToolThinkingFold")}
        description={t("uiPreview.demos.agentToolThinkingFoldDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentExecutionGroup
            items={[
              {
                type: "thinking",
                dotColor: "bg-rose-300",
                node: (
                  <AgentThinkingBlock content="用户询问组件折叠方式，需要先梳理 Agent 消息块结构，再确认思考与工具调用的合并策略。" />
                ),
              },
              {
                type: "tool",
                dotColor: "bg-amber-300",
                node: <AgentToolCallBlock toolCall={READ_CALL} />,
              },
              {
                type: "tool",
                dotColor: "bg-amber-300",
                node: <AgentToolCallBlock toolCall={BASH_CALL} />,
              },
            ]}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.agentToolThinkingMcpFold")}
        description={t("uiPreview.demos.agentToolThinkingMcpFoldDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentExecutionGroup
            items={[
              {
                type: "thinking",
                dotColor: "bg-rose-300",
                node: (
                  <AgentThinkingBlock content="需要调用 MCP 服务获取仓库信息，先确认服务与工具方法名。" />
                ),
              },
              {
                type: "tool",
                dotColor: "bg-amber-300",
                node: <AgentToolCallBlock toolCall={GREP_CALL} />,
              },
              {
                type: "mcp",
                dotColor: "bg-cyan-300",
                node: <AgentMcpCallBlock toolCalls={MCP_CALLS} />,
              },
            ]}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.agentToolThinkingMcpWebFold")}
        description={t("uiPreview.demos.agentToolThinkingMcpWebFoldDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentExecutionGroup
            items={[
              {
                type: "thinking",
                dotColor: "bg-rose-300",
                node: (
                  <AgentThinkingBlock content="需要联网搜索确认最新版本号，再通过 MCP 查询仓库信息。" />
                ),
              },
              {
                type: "tool",
                dotColor: "bg-amber-300",
                node: <AgentToolCallBlock toolCall={GREP_CALL} />,
              },
              {
                type: "mcp",
                dotColor: "bg-cyan-300",
                node: <AgentMcpCallBlock toolCalls={MCP_CALLS} />,
              },
              {
                type: "webSearch",
                dotColor: "bg-emerald-300",
                node: <AgentWebSearchBlock toolCalls={WEB_SEARCH_CALLS} />,
              },
            ]}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
