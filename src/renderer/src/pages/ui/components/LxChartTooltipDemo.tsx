import type React from "react"

import { LxChartTooltip, type LxChartTooltipEntry } from "@/components/ui/LxChartTooltip"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxChartTooltip 组件。
 */
export const LxChartTooltipDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  const payload: LxChartTooltipEntry[] = [
    {
      name: t("uiPreview.demos.mock.chart.requests"),
      value: 123456,
      color: "#60a5fa",
      dataKey: "requests",
    },
    {
      name: t("uiPreview.demos.mock.chart.errors"),
      value: 7,
      color: "#f87171",
      dataKey: "errors",
    },
  ]

  // 自定义数值格式：按千分位展示。
  const formatCount = (entry: LxChartTooltipEntry): string =>
    new Intl.NumberFormat().format(Number(entry.value ?? 0))

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.chartTooltipDefault")}
        description={t("uiPreview.demos.chartTooltipDefaultDesc")}
      >
        <div className="max-w-72">
          <LxChartTooltip active payload={payload} label="2026-09-27" />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.chartTooltipFormatter")}
        description={t("uiPreview.demos.chartTooltipFormatterDesc")}
      >
        <div className="max-w-72">
          <LxChartTooltip
            active
            payload={payload}
            label="2026-09-27"
            valueFormatter={formatCount}
          />
        </div>
      </UiPreviewSection>
    </div>
  )
}
