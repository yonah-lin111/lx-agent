import type { CollaborationMode } from "@shared/contracts/agent"
import type React from "react"
import { LxTag } from "@/components/ui/LxTag"
import type { ExecutionModeSwitchContent } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"

// 模式标签/描述文案键（与协作模式权限卡片同源）。
const MODE_LABEL_KEYS: Record<CollaborationMode, TranslationKey> = {
  build: "agent.collaborationModeBuild",
  plan: "agent.collaborationModePlan",
  review: "agent.collaborationModeReview",
  design: "agent.collaborationModeDesign",
}

const MODE_DESC_KEYS: Record<CollaborationMode, TranslationKey> = {
  build: "agent.collaborationModeBuildDesc",
  plan: "agent.collaborationModePlanDesc",
  review: "agent.collaborationModeReviewDesc",
  design: "agent.collaborationModeDesignDesc",
}

// 模式标签配色（与状态栏协作模式指示一致）。
const MODE_TAG_COLORS: Record<CollaborationMode, "default" | "sky" | "purple" | "pink"> = {
  build: "default",
  plan: "sky",
  review: "purple",
  design: "pink",
}

export interface FlowItemModeSwitchContentProps {
  content: ExecutionModeSwitchContent
}

/**
 * 协作模式切换详情：展示当前模式与模式职责（模式提示词由系统提示词模式段注入，此处不重复展开）。
 */
export const FlowItemModeSwitchContent = ({
  content,
}: FlowItemModeSwitchContentProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="agent-execution-flow-mode-switch-content flex flex-col gap-2 font-mono text-xs text-white/70">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-white/40">{t("agent.modeLabel")}</span>
          <LxTag size="small" color={MODE_TAG_COLORS[content.mode]}>
            {t(MODE_LABEL_KEYS[content.mode])}
          </LxTag>
        </div>
      </div>
      <div className="text-white/45">{t(MODE_DESC_KEYS[content.mode])}</div>
    </div>
  )
}
