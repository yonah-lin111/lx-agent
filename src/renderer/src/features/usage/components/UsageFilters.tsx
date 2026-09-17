import { resolveUsageRangeSelection } from "@shared/contracts/usage"
import { useMemo } from "react"
import { LxDatePicker, type LxDateRangePreset } from "@/components/ui/LxDatePicker"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { type TranslationKey, useTranslation } from "@/i18n"
import type { DateRange } from "@/lib/date"
import type { UsageFilterOptions, UsageRangeSelection, UsageTimeRange } from "../types"
import { toLocalDateKey } from "../utils"

export interface UsageFiltersProps {
  rangeSelection: UsageRangeSelection
  provider?: string
  model?: string
  projectId?: string
  sessionId?: string
  filterOptions: UsageFilterOptions
  refreshIntervalMs: number
  onRangeSelectionChange: (selection: UsageRangeSelection) => void
  onProviderChange: (provider?: string) => void
  onModelChange: (model?: string) => void
  onProjectChange: (projectId?: string) => void
  onSessionChange: (sessionId?: string) => void
  onRefreshIntervalChange: (intervalMs: number) => void
}

const ALL_VALUE = "__all__"

// 范围预设选项与文案 key（顺序即展示顺序）。
const RANGE_PRESET_KEYS: Record<UsageTimeRange, TranslationKey> = {
  today: "usage.timeRange.today",
  "7d": "usage.timeRange.7d",
  "30d": "usage.timeRange.30d",
  all: "usage.timeRange.all",
}

// 自动刷新间隔选项（毫秒，0 = 关闭）。
const REFRESH_INTERVAL_OPTIONS_MS = [0, 5000, 10000, 30000] as const

/**
 * 用量页筛选栏：时间范围（预设 + 自定义区间）、Provider / Model / 项目 / 会话筛选。
 */
export const UsageFilters = ({
  rangeSelection,
  provider,
  model,
  projectId,
  sessionId,
  filterOptions,
  refreshIntervalMs,
  onRangeSelectionChange,
  onProviderChange,
  onModelChange,
  onProjectChange,
  onSessionChange,
  onRefreshIntervalChange,
}: UsageFiltersProps): React.JSX.Element => {
  const { t } = useTranslation()

  const rangePresets: LxDateRangePreset[] = useMemo(
    () =>
      (Object.keys(RANGE_PRESET_KEYS) as UsageTimeRange[]).map((preset) => ({
        key: preset,
        label: t(RANGE_PRESET_KEYS[preset]),
      })),
    [t],
  )

  // 月历高亮区间：复用契约解析结果，避免在组件内重复预设的日数推导；all 无边界。
  const rangeValue: DateRange | null = useMemo(() => {
    if (rangeSelection.preset === "all") return null
    const { startTime, endTime } = resolveUsageRangeSelection(rangeSelection)
    if (startTime === undefined || endTime === undefined) return null
    return { startDate: toLocalDateKey(startTime), endDate: toLocalDateKey(endTime) }
  }, [rangeSelection])

  const activePresetKey = rangeSelection.preset === "custom" ? null : rangeSelection.preset
  const triggerLabel =
    rangeSelection.preset === "custom" ? undefined : t(RANGE_PRESET_KEYS[rangeSelection.preset])

  const handlePresetSelect = (key: string): void => {
    const preset = (Object.keys(RANGE_PRESET_KEYS) as UsageTimeRange[]).find(
      (candidate) => candidate === key,
    )
    if (!preset) return
    onRangeSelectionChange({ preset })
  }

  const handleRangeChange = (range: DateRange): void => {
    onRangeSelectionChange({ preset: "custom", startDate: range.startDate, endDate: range.endDate })
  }

  const refreshIntervalOptions: LxSelectOption<string>[] = useMemo(
    () =>
      REFRESH_INTERVAL_OPTIONS_MS.map((ms) => ({
        value: String(ms),
        label: ms === 0 ? t("usage.autoRefresh.off") : `${ms / 1000}s`,
      })),
    [t],
  )

  const providerOptions: LxSelectOption<string>[] = useMemo(
    () => [
      { value: ALL_VALUE, label: t("usage.allProviders") },
      ...filterOptions.providers.map((name) => ({ value: name, label: name })),
    ],
    [filterOptions.providers, t],
  )

  const modelOptions: LxSelectOption<string>[] = useMemo(
    () => [
      { value: ALL_VALUE, label: t("usage.allModels") },
      ...filterOptions.models.map((name) => ({ value: name, label: name })),
    ],
    [filterOptions.models, t],
  )

  const projectOptions: LxSelectOption<string>[] = useMemo(
    () => [
      { value: ALL_VALUE, label: t("usage.allProjects") },
      ...filterOptions.projects.map((project) => ({ value: project.id, label: project.name })),
    ],
    [filterOptions.projects, t],
  )

  const sessionOptions: LxSelectOption<string>[] = useMemo(
    () => [
      { value: ALL_VALUE, label: t("usage.allSessions") },
      ...filterOptions.sessions.map((session) => ({ value: session.id, label: session.name })),
    ],
    [filterOptions.sessions, t],
  )

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="w-40 shrink-0">
        <LxDatePicker
          mode="range"
          className="w-full"
          rangeValue={rangeValue}
          presets={rangePresets}
          activePresetKey={activePresetKey}
          triggerLabel={triggerLabel}
          onPresetSelect={handlePresetSelect}
          onRangeChange={handleRangeChange}
        />
      </div>
      <div className="w-40 shrink-0">
        <LxSelect
          size="small"
          value={provider ?? ALL_VALUE}
          options={providerOptions}
          onChange={(value) => onProviderChange(value === ALL_VALUE ? undefined : value)}
        />
      </div>
      <div className="w-44 shrink-0">
        <LxSelect
          size="small"
          value={model ?? ALL_VALUE}
          options={modelOptions}
          onChange={(value) => onModelChange(value === ALL_VALUE ? undefined : value)}
        />
      </div>
      <div className="w-44 shrink-0">
        <LxSelect
          size="small"
          value={projectId ?? ALL_VALUE}
          options={projectOptions}
          onChange={(value) => onProjectChange(value === ALL_VALUE ? undefined : value)}
        />
      </div>
      <div className="w-52 shrink-0">
        <LxSelect
          size="small"
          value={sessionId ?? ALL_VALUE}
          options={sessionOptions}
          onChange={(value) => onSessionChange(value === ALL_VALUE ? undefined : value)}
        />
      </div>
      <div className="w-28 shrink-0">
        <LxSelect
          size="small"
          value={String(refreshIntervalMs)}
          options={refreshIntervalOptions}
          onChange={(value) => onRefreshIntervalChange(Number(value))}
        />
      </div>
    </div>
  )
}
