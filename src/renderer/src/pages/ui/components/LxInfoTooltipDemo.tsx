import type React from "react"

import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxInfoTooltip 组件。
 */
export const LxInfoTooltipDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const markdown = t("uiPreview.demos.mock.infoTooltip.markdown")

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.infoTooltipDefault")}
        description={t("uiPreview.demos.infoTooltipDefaultDesc")}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-white/80">{t("uiPreview.demos.infoTooltipLabel")}</span>
          <LxInfoTooltip markdown={markdown} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.infoTooltipCustom")}
        description={t("uiPreview.demos.infoTooltipCustomDesc")}
      >
        <LxInfoTooltip markdown={markdown} showIcon={false} placement="bottom">
          <span className="text-xs text-white/70 underline decoration-dotted underline-offset-4">
            {t("uiPreview.demos.infoTooltipTrigger")}
          </span>
        </LxInfoTooltip>
      </UiPreviewSection>
    </div>
  )
}
