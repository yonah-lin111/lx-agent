import type React from "react"
import { useState } from "react"

import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxRadio / LxRadioGroup 组件。
 */
export const LxRadioDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [value, setValue] = useState("option-a")
  const [themeValue, setThemeValue] = useState("dark")

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.verticalRadioGroup")}
        description={t("uiPreview.demos.verticalRadioGroupDesc")}
      >
        <div className="flex flex-col gap-1">
          <LxRadioGroup name="preview-radio" value={value} onChange={setValue}>
            <LxRadio value="option-a" label={t("uiPreview.demos.optionA")} />
            <LxRadio value="option-b" label={t("uiPreview.demos.optionB")} />
            <LxRadio value="option-c" label={t("uiPreview.demos.optionCDisabled")} disabled />
          </LxRadioGroup>
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.horizontalRadioGroup")}
        description={t("uiPreview.demos.horizontalRadioGroupDesc")}
      >
        <LxRadioGroup
          className="flex flex-wrap gap-2"
          name="preview-radio-theme"
          value={themeValue}
          onChange={setThemeValue}
        >
          <LxRadio value="system" label={t("uiPreview.demos.followSystem")} />
          <LxRadio value="light" label={t("uiPreview.demos.light")} />
          <LxRadio value="dark" label={t("uiPreview.demos.dark")} />
        </LxRadioGroup>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.disabledState")}
        description={t("uiPreview.demos.disabledRadioDesc")}
      >
        <div className="flex flex-col gap-3">
          <LxRadioGroup name="preview-radio-disabled" value="one" onChange={() => {}} disabled>
            <LxRadio value="one" label={t("uiPreview.demos.option1")} />
            <LxRadio value="two" label={t("uiPreview.demos.option2")} />
          </LxRadioGroup>
          <LxRadioGroup name="preview-radio-partial" value="a" onChange={() => {}}>
            <LxRadio value="a" label={t("uiPreview.demos.optionA")} />
            <LxRadio value="b" label={t("uiPreview.demos.optionCDisabled")} disabled />
          </LxRadioGroup>
        </div>
      </UiPreviewSection>
    </div>
  )
}
