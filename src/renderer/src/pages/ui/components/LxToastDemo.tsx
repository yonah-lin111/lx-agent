import type React from "react"

import { useLxToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxToast 组件。
 */
export const LxToastDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const showStackedToasts = (): void => {
    toast.success(t("uiPreview.demos.firstSaved"))
    window.setTimeout(() => toast.warning(t("uiPreview.demos.secondDiskLow")), 300)
    window.setTimeout(() => toast.error(t("uiPreview.demos.thirdConnFailed")), 600)
  }

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.toastTitle")}
        description={t("uiPreview.demos.toastDesc")}
      >
        <div className="flex flex-wrap gap-2">
          <UiActionButton onClick={() => toast.success(t("uiPreview.demos.saveSuccess"))}>
            Success
          </UiActionButton>
          <UiActionButton onClick={() => toast.error(t("uiPreview.demos.saveFailed"))}>
            Error
          </UiActionButton>
          <UiActionButton onClick={() => toast.warning(t("uiPreview.demos.diskSpaceLow"))}>
            Warning
          </UiActionButton>
          <UiActionButton onClick={() => toast.info(t("uiPreview.demos.taskQueued"))}>
            Info
          </UiActionButton>
          <UiActionButton onClick={showStackedToasts}>
            {t("uiPreview.demos.stackedToasts")}
          </UiActionButton>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.toastPlacements")}
        description={t("uiPreview.demos.toastPlacementsDesc")}
      >
        <div className="flex flex-wrap gap-2">
          <UiActionButton
            onClick={() => toast.success(t("uiPreview.demos.bottomRightMsg"), 3000, "bottom-right")}
          >
            Bottom Right
          </UiActionButton>
          <UiActionButton
            onClick={() => toast.success(t("uiPreview.demos.topRightMsg"), 3000, "top-right")}
          >
            Top Right
          </UiActionButton>
          <UiActionButton
            onClick={() => toast.success(t("uiPreview.demos.bottomLeftMsg"), 3000, "bottom-left")}
          >
            Bottom Left
          </UiActionButton>
          <UiActionButton
            onClick={() => toast.success(t("uiPreview.demos.topLeftMsg"), 3000, "top-left")}
          >
            Top Left
          </UiActionButton>
          <UiActionButton
            onClick={() => toast.success(t("uiPreview.demos.topCenterMsg"), 3000, "top-center")}
          >
            Top Center
          </UiActionButton>
        </div>
      </UiPreviewSection>
    </div>
  )
}
