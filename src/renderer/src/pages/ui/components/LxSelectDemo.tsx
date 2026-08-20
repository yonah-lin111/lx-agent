import type React from "react"
import { useMemo, useState } from "react"

import { LxSelect, type LxSelectGroup, type LxSelectOption } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxSelect 组件。
 */
export const LxSelectDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [value, setValue] = useState("opus")
  const [regionValue, setRegionValue] = useState("shanghai")
  const [smallValue, setSmallValue] = useState("small")

  const modelOptions: (LxSelectOption<string> | LxSelectGroup<string>)[] = useMemo(
    () => [
      { value: "opus", label: "Opus" },
      { value: "sonnet", label: "Sonnet" },
      {
        label: "Open Source",
        options: [
          { value: "deepseek", label: "DeepSeek" },
          { value: "qwen", label: "Qwen" },
        ],
      },
    ],
    [],
  )

  const regionOptions: (LxSelectOption<string> | LxSelectGroup<string>)[] = useMemo(
    () => [
      {
        label: "Region A",
        options: [
          { value: "shanghai", label: "Shanghai" },
          { value: "hangzhou", label: "Hangzhou" },
        ],
      },
      {
        label: "Region B",
        options: [
          { value: "shenzhen", label: "Shenzhen" },
          { value: "guangzhou", label: "Guangzhou" },
        ],
      },
    ],
    [],
  )

  const sizeOptions: LxSelectOption<string>[] = useMemo(
    () => [
      { value: "small", label: "small" },
      { value: "other", label: t("common.all") },
    ],
    [t],
  )

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.selectBasic")}
        description={t("uiPreview.demos.selectBasicDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxSelect value={value} onChange={setValue} options={modelOptions} />
          <LxSelect
            value="disabled"
            onChange={() => {}}
            options={[{ value: "disabled", label: t("common.disabled") }]}
            disabled
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.selectGroup")}
        description={t("uiPreview.demos.selectGroupDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxSelect value={regionValue} onChange={setRegionValue} options={regionOptions} />
          <LxSelect value="" onChange={() => {}} options={[]} placeholder={t("common.none")} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.selectPlacement")}
        description={t("uiPreview.demos.selectPlacementDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxSelect
            size="small"
            value={smallValue}
            onChange={setSmallValue}
            options={sizeOptions}
          />
          <LxSelect
            position="up"
            value={value}
            onChange={setValue}
            options={[
              { value: "opus", label: "Popup Upward" },
              { value: "sonnet", label: "Sonnet" },
            ]}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
