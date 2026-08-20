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
  const [mediumValue, setMediumValue] = useState("medium")
  const [largeValue, setLargeValue] = useState("large")

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
      { value: "small", label: "small (h-6)" },
      { value: "medium", label: "medium (h-7)" },
      { value: "large", label: "large (h-8)" },
    ],
    [],
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
        title={t("uiPreview.demos.sizesAndShapes")}
        description={t("uiPreview.demos.sizesAndShapesDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/45">small (h-6 / 24px)</span>
            <LxSelect
              size="small"
              value={smallValue}
              onChange={setSmallValue}
              options={sizeOptions}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/45">medium (h-7 / 28px)</span>
            <LxSelect
              size="medium"
              value={mediumValue}
              onChange={setMediumValue}
              options={sizeOptions}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-white/45">large (h-8 / 32px)</span>
            <LxSelect
              size="large"
              value={largeValue}
              onChange={setLargeValue}
              options={sizeOptions}
            />
          </div>
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
