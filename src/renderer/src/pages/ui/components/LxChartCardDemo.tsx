import type React from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts"

import { LxChartCard } from "@/components/ui/LxChartCard"
import { LxChartTooltip } from "@/components/ui/LxChartTooltip"
import { useTranslation } from "@/i18n"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

const CHART_HEIGHT = 200

// 演示数据：日期为语言无关的短横线格式，避免额外词条。
const CHART_DATA = [
  { date: "09-21", requests: 42 },
  { date: "09-22", requests: 58 },
  { date: "09-23", requests: 51 },
  { date: "09-24", requests: 76 },
  { date: "09-25", requests: 63 },
  { date: "09-26", requests: 88 },
  { date: "09-27", requests: 70 },
]

/**
 * 预览 LxChartCard 组件。
 */
export const LxChartCardDemo = (): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.chartCardContent")}
        description={t("uiPreview.demos.chartCardContentDesc")}
      >
        <LxChartCard
          title={t("uiPreview.demos.mock.chart.requests")}
          subtitle="7d"
          isEmpty={false}
          emptyText={t("uiPreview.demos.mock.chart.noData")}
          height={CHART_HEIGHT}
        >
          <div style={{ height: CHART_HEIGHT }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                accessibilityLayer={false}
                data={CHART_DATA}
                margin={{ top: 5, right: 5, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="demoChartRequests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--color-theme-border)"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--color-theme-text-muted)", fontSize: 12 }}
                />
                <Tooltip
                  content={<LxChartTooltip />}
                  cursor={{ stroke: "var(--color-theme-border-strong)", strokeDasharray: "3 3" }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  name={t("uiPreview.demos.mock.chart.requests")}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  fill="url(#demoChartRequests)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </LxChartCard>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.chartCardEmpty")}
        description={t("uiPreview.demos.chartCardEmptyDesc")}
      >
        <LxChartCard
          title={t("uiPreview.demos.mock.chart.requests")}
          isEmpty
          emptyText={t("uiPreview.demos.mock.chart.noData")}
          height={CHART_HEIGHT}
        >
          {null}
        </LxChartCard>
      </UiPreviewSection>
    </div>
  )
}
