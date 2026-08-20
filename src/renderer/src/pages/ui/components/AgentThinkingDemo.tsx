import type React from "react"

import { AgentThinkingBlock } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 AgentThinkingBlock 组件。
 */
export const AgentThinkingDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.agentThinkingTitle")}
        description={t("uiPreview.demos.agentThinkingDesc")}
      >
        <div className="flex max-w-lg flex-col">
          <AgentThinkingBlock content="Thinking process content example..." />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("common.loading")}
        description="isGenerating displays Thinking state and pulsating indicator"
      >
        <div className="flex max-w-lg flex-col">
          <AgentThinkingBlock
            content="Analyzing code structure and generating output..."
            isGenerating
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
