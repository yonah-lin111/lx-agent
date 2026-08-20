import type React from "react"
import { useState } from "react"

import { AgentMessageListSkeleton } from "@/features/agent"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 AgentMessageListSkeleton 组件。
 */
export const AgentMessageListSkeletonDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.skeletonTitle")}
        description={t("uiPreview.demos.skeletonDesc")}
      >
        <div className="relative flex h-72 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
          <AgentMessageListSkeleton isLoading={isLoading} />
        </div>
        <div className="mt-3">
          <UiActionButton onClick={() => setIsLoading((current) => !current)}>
            {isLoading ? t("uiPreview.demos.stopLoading") : t("uiPreview.demos.startLoading")}
          </UiActionButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
