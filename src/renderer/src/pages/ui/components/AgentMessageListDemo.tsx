import type React from "react"
import { useState } from "react"

import { AgentMessageList, type ChatMessage } from "@/features/agent"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例对话流。
const SAMPLE_CONVERSATION: ChatMessage[] = [
  {
    id: "user-1",
    role: "user",
    isStreaming: false,
    blocks: [
      { kind: "text", text: "帮我分析 lx-agent 的 agent 渲染流程，并检查项目中是否有 TODO 待办。" },
    ],
  },
  {
    id: "assistant-1",
    role: "assistant",
    isStreaming: false,
    blocks: [
      { kind: "thinking", text: "需要先定位 agent 渲染入口，再搜索 TODO 标记。" },
      {
        kind: "toolCall",
        toolCallId: "ls-1",
        toolName: "ls",
        args: { path: "src/renderer/src/features/agent" },
        status: "done",
      },
      {
        kind: "toolCall",
        toolCallId: "grep-1",
        toolName: "grep",
        args: { pattern: "TODO", path: "src" },
        status: "done",
      },
      {
        kind: "toolCall",
        toolCallId: "mcp-1",
        toolName: "github_search_code",
        args: { query: "TODO" },
        status: "done",
      },
      {
        kind: "text",
        text: "已梳理完成。agent 渲染由 **AgentMessageList** 驱动，工具调用通过 **AgentMessageItem** 分组展示。",
      },
    ],
  },
]

/**
 * 预览 AgentMessageList 组件。
 */
export const AgentMessageListDemo = (): React.JSX.Element => {
  const [messages, setMessages] = useState<ChatMessage[]>(SAMPLE_CONVERSATION)

  /**
   * 受控更新指定消息的文本内容。
   */
  const handleEditMessage = (id: string, content: string): void => {
    setMessages((current) =>
      current.map((message) =>
        message.id === id
          ? {
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "text" ? { ...block, text: content } : block,
              ),
            }
          : message,
      ),
    )
  }

  /**
   * 删除指定消息。
   */
  const handleDeleteMessage = (messageId: string): void => {
    setMessages((current) => current.filter((message) => message.id !== messageId))
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection title="空状态" description="无消息时的欢迎卡片与快捷灵感推荐">
        <div className="flex h-80 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
          <AgentMessageList messages={[]} isRestoring={false} onSelectPrompt={() => {}} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title="对话流"
        description="用户与 AI 消息完整列表，含思考、工具与 MCP 调用"
      >
        <div className="flex h-96 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
          <AgentMessageList
            messages={messages}
            onSelectPrompt={() => {}}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
