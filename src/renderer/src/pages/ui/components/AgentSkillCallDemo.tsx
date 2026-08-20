import type React from "react"

import { AgentSkillCallBlock, type ChatBlock } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 连续执行的 Skill 调用。
const SKILL_CALLS: ToolCallBlock[] = [
  {
    kind: "toolCall",
    toolCallId: "skill-1",
    toolName: "read_skill",
    args: { name: "grill-me" },
    status: "done",
  },
  {
    kind: "toolCall",
    toolCallId: "skill-2",
    toolName: "read_skill",
    args: { name: "ssh-cloud-manager" },
    status: "done",
  },
]

/**
 * 预览 AgentSkillCallBlock 组件。
 */
export const AgentSkillCallDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.agentSkillTitle")}
        description={t("uiPreview.demos.agentSkillDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentSkillCallBlock toolCalls={SKILL_CALLS} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
