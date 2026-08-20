import type React from "react"
import { useState } from "react"

import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxLoadingOverlay 组件。
 */
export const LxLoadingOverlayDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.loadingOverlayTitle")}
        description={t("uiPreview.demos.loadingOverlayDesc")}
      >
        <div className="relative flex h-48 flex-col overflow-hidden rounded-[6px] border border-white/5">
          <div className="flex flex-1 items-center justify-center text-xs text-white/30">
            Container
          </div>
          <LxLoadingOverlay isLoading={isLoading} text="Loading component..." />
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
