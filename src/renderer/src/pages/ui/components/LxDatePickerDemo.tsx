import type React from "react"
import { useState } from "react"

import { LxDatePicker, type LxDateRangePreset } from "@/components/ui/LxDatePicker"
import { useTranslation } from "@/i18n"
import { type DateRange, getMonthKey, getTodayKey, getWeekStartKey, shiftDateKey } from "@/lib/date"
import { UiPreviewSection } from "@/pages/ui/components/UiPreviewSection"

/**
 * 预览 LxDatePicker 组件。
 */
export const LxDatePickerDemo = (): React.JSX.Element => {
  const { t } = useTranslation()
  const todayKey = getTodayKey()
  const [dateValue, setDateValue] = useState(todayKey)
  const [badgeDateValue, setBadgeDateValue] = useState(todayKey)
  const [weekValue, setWeekValue] = useState(() => getWeekStartKey(todayKey))
  const [monthValue, setMonthValue] = useState(() => getMonthKey(todayKey))
  const [smallValue, setSmallValue] = useState(todayKey)
  const [mediumValue, setMediumValue] = useState(todayKey)
  const [largeValue, setLargeValue] = useState(todayKey)
  const [rangeValue, setRangeValue] = useState<DateRange | null>(() => ({
    startDate: shiftDateKey(todayKey, -6),
    endDate: todayKey,
  }))
  const [activePresetKey, setActivePresetKey] = useState<string | null>("last7")

  const rangePresets: LxDateRangePreset[] = [
    { key: "last7", label: t("uiPreview.demos.mock.datePicker.last7") },
    { key: "last30", label: t("uiPreview.demos.mock.datePicker.last30") },
    { key: "all", label: t("uiPreview.demos.mock.datePicker.all") },
  ]
  const activePreset = rangePresets.find((preset) => preset.key === activePresetKey)

  // 每日条目角标：今天与后天各给一个计数。
  const entryCountMap: Record<string, number> = {
    [todayKey]: 3,
    [shiftDateKey(todayKey, 2)]: 12,
  }

  const handlePresetSelect = (key: string): void => {
    setActivePresetKey(key)
    if (key === "all") {
      setRangeValue(null)
      return
    }
    const offset = key === "last30" ? -29 : -6
    setRangeValue({ startDate: shiftDateKey(todayKey, offset), endDate: todayKey })
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <UiPreviewSection
        title={t("uiPreview.demos.datePickerDateMode")}
        description={t("uiPreview.demos.datePickerDateModeDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxDatePicker value={dateValue} onChange={setDateValue} />
          <LxDatePicker
            value={badgeDateValue}
            onChange={setBadgeDateValue}
            showNavButtons
            entryCountMap={entryCountMap}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.datePickerWeekMode")}
        description={t("uiPreview.demos.datePickerWeekModeDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxDatePicker mode="week" value={weekValue} onChange={setWeekValue} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.datePickerMonthMode")}
        description={t("uiPreview.demos.datePickerMonthModeDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxDatePicker mode="month" value={monthValue} onChange={setMonthValue} />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.datePickerRangeMode")}
        description={t("uiPreview.demos.datePickerRangeModeDesc")}
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <LxDatePicker
            mode="range"
            className="w-full"
            rangeValue={rangeValue}
            presets={rangePresets}
            activePresetKey={activePresetKey}
            triggerLabel={activePreset?.label}
            onPresetSelect={handlePresetSelect}
            onRangeChange={setRangeValue}
          />
        </div>
      </UiPreviewSection>
      <UiPreviewSection
        title={t("uiPreview.demos.datePickerSizes")}
        description={t("uiPreview.demos.datePickerSizesDesc")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <LxDatePicker size="small" value={smallValue} onChange={setSmallValue} />
          <LxDatePicker size="medium" value={mediumValue} onChange={setMediumValue} />
          <LxDatePicker size="large" value={largeValue} onChange={setLargeValue} />
        </div>
      </UiPreviewSection>
    </div>
  )
}
