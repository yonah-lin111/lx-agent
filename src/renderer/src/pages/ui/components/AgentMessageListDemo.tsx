import type React from "react"
import { useState } from "react"

import { AgentMessageList, type ChatMessage } from "@/features/agent"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例对话流。
const createSampleConversation = (t: I18nContextType["t"]): ChatMessage[] => [
  {
    id: "user-1",
    role: "user",
    isStreaming: false,
    blocks: [{ kind: "text", text: t("uiPreview.demos.mock.messageList.userText") }],
  },
  {
    id: "assistant-1",
    role: "assistant",
    isStreaming: false,
    blocks: [
      { kind: "thinking", text: t("uiPreview.demos.mock.messageList.thinking") },
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
        text: t("uiPreview.demos.mock.messageList.assistantText"),
      },
    ],
  },
]

/**
 * 预览 AgentMessageList 组件。
 */
export const AgentMessageListDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [messages, setMessages] = useState<ChatMessage[]>(() => createSampleConversation(t))

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
      <UiPreviewSection
        title={t("uiPreview.demos.emptyStateTitle")}
        description={t("uiPreview.demos.emptyStateDesc")}
      >
        <div className="flex h-80 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
          <AgentMessageList messages={[]} isRestoring={false} onSelectPrompt={() => {}} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.messageListTitle")}
        description={t("uiPreview.demos.messageListDesc")}
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
