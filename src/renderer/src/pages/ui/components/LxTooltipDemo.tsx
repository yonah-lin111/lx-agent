import type React from "react"

import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { UiActionButton } from "@/pages/ui/components/UiActionButton"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxTooltip 组件。
 */
export const LxTooltipDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.tooltipBasic")}
        description={t("uiPreview.demos.tooltipBasicDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LxTooltip content="Top tooltip" placement="top">
            <UiActionButton>Top</UiActionButton>
          </LxTooltip>
          <LxTooltip content="Bottom tooltip" placement="bottom">
            <UiActionButton>Bottom</UiActionButton>
          </LxTooltip>
          <LxTooltip content="Left tooltip" placement="left">
            <UiActionButton>Left</UiActionButton>
          </LxTooltip>
          <LxTooltip content="Right tooltip" placement="right">
            <UiActionButton>Right</UiActionButton>
          </LxTooltip>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.tooltipConfirm")}
        description={t("uiPreview.demos.tooltipConfirmDesc")}
      >
        <LxTooltip
          title={t("common.confirmDelete")}
          content={t("uiPreview.demos.deleteConfirmPrompt")}
          placement="bottom"
          onConfirm={() => {}}
          onCancel={() => {}}
        >
          <UiActionButton>{t("common.delete")}</UiActionButton>
        </LxTooltip>
      </UiPreviewSection>
    </div>
  )
}
