import { RefreshCw } from "lucide-react"
import { useMemo } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { useTranslation } from "@/i18n"
import type { UsageFilterOptions, UsageTimeRange } from "../types"

export interface UsageFiltersProps {
  range: UsageTimeRange
  provider?: string
  model?: string
  projectId?: string
  filterOptions: UsageFilterOptions
  isLoading: boolean
  onRangeChange: (range: UsageTimeRange) => void
  onProviderChange: (provider?: string) => void
  onModelChange: (model?: string) => void
  onProjectChange: (projectId?: string) => void
  onRefresh: () => void
}

const ALL_VALUE = "__all__"

/**
 * 用量页筛选栏：时间预设、Provider / Model / 项目级联筛选与手动刷新。
 */
export const UsageFilters = ({
  range,
  provider,
  model,
  projectId,
  filterOptions,
  isLoading,
  onRangeChange,
  onProviderChange,
  onModelChange,
  onProjectChange,
  onRefresh,
}: UsageFiltersProps): React.JSX.Element => {
  const { t } = useTranslation()

  const rangeOptions: LxSelectOption<UsageTimeRange>[] = useMemo(
    () => [
      { value: "today", label: t("usage.timeRange.today") },
      { value: "7d", label: t("usage.timeRange.7d") },
      { value: "30d", label: t("usage.timeRange.30d") },
      { value: "all", label: t("usage.timeRange.all") },
    ],
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

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="w-32 shrink-0">
        <LxSelect size="small" value={range} options={rangeOptions} onChange={onRangeChange} />
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
      <LxIconButton
        size="small"
        aria-label={t("usage.refresh")}
        title={{ content: t("usage.refresh"), placement: "top" }}
        disabled={isLoading}
        onClick={onRefresh}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
      </LxIconButton>
    </div>
  )
}
