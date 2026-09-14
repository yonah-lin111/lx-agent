import type React from "react"
import { useMemo } from "react"
import { AgentTodoCallBlock } from "@/features/agent"
import type { ChatBlock } from "@/features/agent/types"
import { type I18nContextType, useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 示例待办调用快照。
const createMockTodoCall = (t: I18nContextType["t"]): ToolCallBlock => ({
  kind: "toolCall",
  toolCallId: "call_todowrite_1",
  toolName: "todowrite",
  args: {
    todos: [
      {
        content: t("uiPreview.demos.mock.todo.analysis"),
        status: "completed",
        priority: "high",
      },
      {
        content: t("uiPreview.demos.mock.todo.demoPages"),
        status: "in_progress",
        priority: "high",
      },
      {
        content: t("uiPreview.demos.mock.todo.i18nEntries"),
        status: "completed",
        priority: "medium",
      },
      {
        content: t("uiPreview.demos.mock.todo.typecheck"),
        status: "pending",
        priority: "high",
      },
      {
        content: t("uiPreview.demos.mock.todo.obsoleteReview"),
        status: "cancelled",
        priority: "low",
      },
    ],
  },
  status: "done",
})

export const AgentTodoCallDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const mockTodoCall = useMemo(() => createMockTodoCall(t), [t])

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentTodoTitle")}
        description={t("uiPreview.demos.agentTodoDesc")}
      >
        <div className="w-full max-w-xl rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
          <AgentTodoCallBlock toolCall={mockTodoCall} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
