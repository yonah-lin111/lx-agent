import type React from "react"
import { useState } from "react"

import { AgentMessageItem, type ChatMessage } from "@/features/agent"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例用户消息。
const USER_MESSAGE: ChatMessage = {
  id: "user-demo",
  role: "user",
  isStreaming: false,
  blocks: [{ kind: "text", text: "请解释 Agent 消息是如何渲染的？" }],
}

// 示例 AI 消息。
const ASSISTANT_MESSAGE: ChatMessage = {
  id: "assistant-demo",
  role: "assistant",
  isStreaming: false,
  blocks: [
    { kind: "thinking", text: "用户询问 Agent 消息渲染，我先梳理聊天数据流与 block 展示逻辑。" },
    {
      kind: "toolCall",
      toolCallId: "msg-read",
      toolName: "read",
      args: { path: "src/renderer/src/features/agent/types.ts" },
      status: "done",
    },
    {
      kind: "text",
      text: "Agent 会话以 **事件流** 驱动，消息按内容块（文本 / 思考 / 工具调用）拆分渲染。",
    },
  ],
}

/**
 * 预览 AgentMessageItem 组件。
 */
export const AgentMessageItemDemo = (): React.JSX.Element => {
  const [userMessage, setUserMessage] = useState<ChatMessage>(USER_MESSAGE)

  /**
   * 受控更新用户消息文本。
   */
  const handleEditUserMessage = (_id: string, content: string): void => {
    setUserMessage((current) => ({
      ...current,
      blocks: current.blocks.map((block) =>
        block.kind === "text" ? { ...block, text: content } : block,
      ),
    }))
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection title="用户消息" description="右侧用户气泡，hover 显示编辑与复制操作">
        <div className="flex flex-col gap-2 rounded-[6px] border border-white/5 bg-[#212121] p-3">
          <AgentMessageItem
            message={userMessage}
            onEdit={handleEditUserMessage}
            onDelete={() => {}}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection title="AI 消息" description="文本 / 思考 / 工具调用块按事件顺序渲染">
        <div className="flex flex-col gap-2 rounded-[6px] border border-white/5 bg-[#212121] p-3">
          <AgentMessageItem message={ASSISTANT_MESSAGE} onDelete={() => {}} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
