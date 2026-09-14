import type React from "react"
import { useMemo, useState } from "react"

import { AgentMessageItem, type ChatMessage } from "@/features/agent"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

// 示例用户消息。
const createUserMessage = (t: I18nContextType["t"]): ChatMessage => ({
  id: "user-demo",
  role: "user",
  isStreaming: false,
  blocks: [{ kind: "text", text: t("uiPreview.demos.mock.messageItem.userText") }],
})

// 示例 AI 消息。
const createAssistantMessage = (t: I18nContextType["t"]): ChatMessage => ({
  id: "assistant-demo",
  role: "assistant",
  isStreaming: false,
  blocks: [
    {
      kind: "thinking",
      text: t("uiPreview.demos.mock.messageItem.assistantThinking"),
    },
    {
      kind: "toolCall",
      toolCallId: "msg-read",
      toolName: "read",
      args: { path: "src/renderer/src/features/agent/types.ts" },
      status: "done",
    },
    {
      kind: "text",
      text: t("uiPreview.demos.mock.messageItem.assistantText"),
    },
  ],
})

// 示例撤销/删除摘要消息。
const createUndoMessage = (t: I18nContextType["t"]): ChatMessage => ({
  id: "undo-demo",
  role: "undoSummary",
  isStreaming: false,
  blocks: [{ kind: "text", text: t("uiPreview.demos.mock.messageItem.undoTarget") }],
  undoPayload: {
    userPrompt: t("uiPreview.demos.mock.messageItem.undoPrompt"),
    modelName: "claude-3-7-sonnet",
    undoneAt: Date.now() - 60000,
    toolCallCount: 2,
    fileChangeCount: 1,
    toolCalls: [
      { toolName: "read", summary: "src/renderer/src/features/agent/AgentMessageList.tsx" },
      { toolName: "edit", summary: "src/renderer/src/features/agent/AgentMessageList.tsx" },
    ],
    diffs: [
      {
        filePath: "src/renderer/src/features/agent/AgentMessageList.tsx",
        toolName: "edit",
        diff: {
          fileName: "src/renderer/src/features/agent/AgentMessageList.tsx",
          stats: { added: 3, removed: 1 },
          truncated: false,
          lines: [
            {
              type: "context",
              text: "  const handleScroll = (): void => {",
              newLine: 320,
              oldLine: 320,
            },
            { type: "del", text: "-   stickToBottomRef.current = nearBottom", oldLine: 321 },
            { type: "add", text: "+   if (isScrollingUp) {", newLine: 321 },
            { type: "add", text: "+     stickToBottomRef.current = false", newLine: 322 },
            { type: "add", text: "+   }", newLine: 323 },
            { type: "context", text: "  }", newLine: 324, oldLine: 322 },
          ],
        },
      },
    ],
  },
})

/**
 * 预览 AgentMessageItem 组件。
 */
export const AgentMessageItemDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [userMessage, setUserMessage] = useState<ChatMessage>(() => createUserMessage(t))
  const assistantMessage = useMemo(() => createAssistantMessage(t), [t])
  const undoMessage = useMemo(() => createUndoMessage(t), [t])

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
      <UiPreviewSection
        title={t("uiPreview.demos.userMessageTitle")}
        description={t("uiPreview.demos.userMessageDesc")}
      >
        <div className="flex flex-col gap-2 rounded-[6px] border border-white/5 bg-[#212121] p-3">
          <AgentMessageItem
            message={userMessage}
            onEdit={handleEditUserMessage}
            onDelete={() => {}}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.aiMessageTitle")}
        description={t("uiPreview.demos.aiMessageDesc")}
      >
        <div className="flex flex-col gap-2 rounded-[6px] border border-white/5 bg-[#212121] p-3">
          <AgentMessageItem message={assistantMessage} onDelete={() => {}} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection title={t("agent.turnUndoneSummary")} description={t("agent.undoSummary")}>
        <div className="flex flex-col gap-2 rounded-[6px] border border-white/5 bg-[#212121] p-3">
          <AgentMessageItem message={undoMessage} onDelete={() => {}} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
