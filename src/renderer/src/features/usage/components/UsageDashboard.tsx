import { useState } from "react"
import { LxLoadingOverlay } from "@/components/ui/LxLoadingOverlay"
import { type TranslationKey, useTranslation } from "@/i18n"
import { useUsageData } from "../hooks/useUsageData"
import { UsageFilters } from "./UsageFilters"
import { UsageModelDistributionChart } from "./UsageModelDistributionChart"
import { UsageModelStatsTable } from "./UsageModelStatsTable"
import { UsageProviderDistributionChart } from "./UsageProviderDistributionChart"
import { UsageProviderStatsTable } from "./UsageProviderStatsTable"
import { UsageRequestLogTable } from "./UsageRequestLogTable"
import { UsageRequestsChart } from "./UsageRequestsChart"
import { UsageSummaryCards } from "./UsageSummaryCards"
import { UsageTokenCompositionChart } from "./UsageTokenCompositionChart"
import { UsageTrendChart } from "./UsageTrendChart"

type UsageTab = "logs" | "models" | "providers"

const TAB_LABEL_KEYS: Record<UsageTab, TranslationKey> = {
  logs: "usage.tabs.logs",
  models: "usage.tabs.models",
  providers: "usage.tabs.providers",
}

/**
 * 用量统计看板：汇总卡、图表与请求日志 / 模型 / Provider 三表。
 */
export const UsageDashboard = (): React.JSX.Element => {
  const { t } = useTranslation()
  const usage = useUsageData()
  const [activeTab, setActiveTab] = useState<UsageTab>("logs")

  return (
    <div className="custom-scrollbar relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable]">
      <LxLoadingOverlay
        isLoading={usage.isLoading && usage.summary === null}
        text="Loading usage..."
      />

      <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold tracking-tight text-[var(--color-theme-text)]">
            {t("usage.title")}
          </h1>
          <p className="truncate text-xs text-[var(--color-theme-text-muted)]">
            {t("usage.subtitle")}
          </p>
        </div>
        <UsageFilters
          range={usage.range}
          provider={usage.provider}
          model={usage.model}
          projectId={usage.projectId}
          filterOptions={usage.filterOptions}
          isLoading={usage.isLoading}
          refreshIntervalMs={usage.refreshIntervalMs}
          onRangeChange={usage.setRange}
          onProviderChange={usage.setProvider}
          onModelChange={usage.setModel}
          onProjectChange={usage.setProjectId}
          onRefreshIntervalChange={usage.setRefreshIntervalMs}
          onRefresh={usage.refresh}
        />
      </div>

      {usage.error ? (
        <div className="rounded-[6px] border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {usage.error}
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          <UsageSummaryCards summary={usage.summary} />

          <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="min-w-0 xl:col-span-2">
              <UsageTrendChart
                daily={usage.daily}
                granularity={usage.granularity}
                startTime={usage.rangeBounds.startTime}
                endTime={usage.rangeBounds.endTime}
              />
            </div>
            <UsageRequestsChart
              daily={usage.daily}
              granularity={usage.granularity}
              startTime={usage.rangeBounds.startTime}
              endTime={usage.rangeBounds.endTime}
            />
            <UsageModelDistributionChart modelStats={usage.modelStats} />
            <UsageProviderDistributionChart providerStats={usage.providerStats} />
            <UsageTokenCompositionChart summary={usage.summary} />
          </div>

          <div className="flex min-w-0 items-center gap-1">
            {(Object.keys(TAB_LABEL_KEYS) as UsageTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex h-7 items-center rounded-[6px] px-3 text-xs transition-colors ${
                  activeTab === tab
                    ? "bg-[var(--color-theme-surface-hover)] font-medium text-[var(--color-theme-text)]"
                    : "text-[var(--color-theme-text-muted)] hover:bg-[var(--color-theme-surface-hover)] hover:text-[var(--color-theme-text)]"
                }`}
              >
                {t(TAB_LABEL_KEYS[tab])}
              </button>
            ))}
          </div>

          {activeTab === "logs" ? (
            <UsageRequestLogTable logPage={usage.logPage} onPageChange={usage.setPage} />
          ) : null}
          {activeTab === "models" ? <UsageModelStatsTable modelStats={usage.modelStats} /> : null}
          {activeTab === "providers" ? (
            <UsageProviderStatsTable providerStats={usage.providerStats} />
          ) : null}
        </div>
      )}
    </div>
  )
}
