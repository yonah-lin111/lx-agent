import type React from "react"
import { AgentTodoCallBlock } from "@/features/agent/components/AgentTodoCallBlock"
import type { ChatBlock } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

const MOCK_TODO_CALL: ToolCallBlock = {
  kind: "toolCall",
  toolCallId: "call_todowrite_1",
  toolName: "todowrite",
  args: {
    todos: [
      {
        content: "分析 agent 目录下需补充 demo 的所有组件与参数结构",
        status: "completed",
        priority: "high",
      },
      {
        content: "编写各新增 Agent 组件的 Demo 页面并接入 UI Preview",
        status: "in_progress",
        priority: "high",
      },
      {
        content: "补充中英文 i18n 翻译词条",
        status: "completed",
        priority: "medium",
      },
      {
        content: "进行类型检查与构建校验",
        status: "pending",
        priority: "high",
      },
      {
        content: "过时的冗余验证流程",
        status: "cancelled",
        priority: "low",
      },
    ],
  },
  status: "done",
}

export const AgentTodoCallDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <UiPreviewSection
        title={t("uiPreview.demos.agentTodoTitle")}
        description={t("uiPreview.demos.agentTodoDesc")}
      >
        <div className="w-full max-w-xl rounded-[6px] border border-white/5 bg-[#1a1a1a] p-3">
          <AgentTodoCallBlock toolCall={MOCK_TODO_CALL} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
