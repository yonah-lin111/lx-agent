import type React from "react"
import { useState } from "react"

import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxCheckbox 组件。
 */
export const LxCheckboxDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [isChecked, setIsChecked] = useState(false)
  const [agreements, setAgreements] = useState({ beta: true, telemetry: false })

  return (
    <div className="flex flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.basicUsage")}
        description={t("uiPreview.demos.basicUsageCheckboxDesc")}
      >
        <div className="flex items-center gap-3">
          <LxCheckbox
            checked={isChecked}
            onChange={setIsChecked}
            aria-label={t("uiPreview.demos.basicUsage")}
          />
          <span className="text-xs text-white/60">
            {isChecked ? t("uiPreview.demos.checked") : t("uiPreview.demos.unchecked")}
          </span>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.checkboxGroup")}
        description={t("uiPreview.demos.checkboxGroupDesc")}
      >
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-white/70">
            <LxCheckbox
              checked={agreements.beta}
              onChange={(checked) => setAgreements({ ...agreements, beta: checked })}
              aria-label={t("uiPreview.demos.joinBeta")}
            />
            {t("uiPreview.demos.joinBeta")}
          </label>
          <label className="flex items-center gap-2 text-xs text-white/70">
            <LxCheckbox
              checked={agreements.telemetry}
              onChange={(checked) => setAgreements({ ...agreements, telemetry: checked })}
              aria-label={t("uiPreview.demos.allowTelemetry")}
            />
            {t("uiPreview.demos.allowTelemetry")}
          </label>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.disabledState")}
        description={t("uiPreview.demos.disabledStateCheckboxDesc")}
      >
        <div className="flex items-center gap-3">
          <LxCheckbox
            checked
            disabled
            onChange={() => {}}
            aria-label={t("uiPreview.demos.disabledAndChecked")}
          />
          <LxCheckbox
            disabled
            onChange={() => {}}
            aria-label={t("uiPreview.demos.disabledStatus")}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
