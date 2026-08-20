import { Search } from "lucide-react"
import type React from "react"
import { useState } from "react"

import { LxInput } from "@/components/ui/LxInput"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxInput 组件。
 */
export const LxInputDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [value, setValue] = useState("")
  const [numberValue, setNumberValue] = useState(0)

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.basicInput")}
        description={t("uiPreview.demos.basicInputDesc")}
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t("uiPreview.demos.inputPlaceholder")}
          />
          <LxInput
            defaultValue={t("uiPreview.demos.clearableContent")}
            clear
            aria-label={t("uiPreview.demos.clearableInput")}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.prefixAndSuffix")}
        description={t("uiPreview.demos.prefixAndSuffixDesc")}
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput
            prefix={<Search className="h-3.5 w-3.5 text-white/40" />}
            placeholder={t("uiPreview.demos.searchKeyword")}
          />
          <LxInput
            suffix={<span className="text-xs text-white/40">@lx.agent</span>}
            defaultValue="yonah"
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.specialModes")}
        description={t("uiPreview.demos.specialModesDesc")}
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput
            type="password"
            defaultValue="secret"
            aria-label={t("uiPreview.demos.passwordInput")}
          />
          <LxInput
            type="number"
            value={numberValue}
            onChange={(event) => setNumberValue(Number(event.target.value))}
            aria-label={t("uiPreview.demos.numberInput")}
          />
          <LxInput
            multiline
            rows={3}
            placeholder={t("uiPreview.demos.multilinePlaceholder")}
            className="lg:col-span-2"
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.sizesAndVariants")}
        description={t("uiPreview.demos.sizesAndVariantsDesc")}
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <LxInput size="xs" placeholder={t("uiPreview.demos.xsSize")} />
          <LxInput size="sm" placeholder={t("uiPreview.demos.smSize")} />
          <LxInput size="lg" placeholder={t("uiPreview.demos.lgSize")} />
          <LxInput variant="simple" placeholder={t("uiPreview.demos.simpleVariant")} />
          <LxInput disabled value={t("uiPreview.demos.disabledStatus")} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
