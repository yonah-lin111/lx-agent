import { ChevronLeft, ChevronRight } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag, type LxTagColor } from "@/components/ui/LxTag"
import { type TranslationKey, useTranslation } from "@/i18n"
import type { UsageLogPage, UsageLogStatus, UsagePurpose } from "../types"
import { formatDateTime, formatDuration, formatNumber, formatUsd } from "../utils"

const STATUS_TAG_COLOR: Record<UsageLogStatus, LxTagColor> = {
  success: "emerald",
  error: "rose",
  aborted: "amber",
}

const PURPOSE_LABEL_KEYS: Record<UsagePurpose, TranslationKey> = {
  chat: "usage.purpose.chat",
  subagent: "usage.purpose.subagent",
  compaction: "usage.purpose.compaction",
  title: "usage.purpose.title",
  suggested: "usage.purpose.suggested",
}

const STATUS_LABEL_KEYS: Record<UsageLogStatus, TranslationKey> = {
  success: "usage.status.success",
  error: "usage.status.error",
  aborted: "usage.status.aborted",
}

export interface UsageRequestLogTableProps {
  logPage: UsageLogPage | null
  onPageChange: (page: number) => void
}

/**
 * 请求日志表：每次模型请求一行，含 token、成本、耗时与状态，支持分页。
 */
export const UsageRequestLogTable = ({
  logPage,
  onPageChange,
}: UsageRequestLogTableProps): React.JSX.Element => {
  const { t } = useTranslation()
  const rows = logPage?.rows ?? []
  const total = logPage?.total ?? 0
  const page = logPage?.page ?? 1
  const pageSize = logPage?.pageSize ?? 50
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="overflow-hidden rounded-[6px] border border-[var(--color-theme-border)] bg-[var(--color-theme-surface)]">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-[var(--color-theme-border)] text-left text-[var(--color-theme-text-muted)]">
                <th className="px-3 py-2 font-medium">{t("usage.columns.time")}</th>
                <th className="px-3 py-2 font-medium">{t("usage.columns.purpose")}</th>
                <th className="px-3 py-2 font-medium">{t("usage.columns.provider")}</th>
                <th className="px-3 py-2 font-medium">{t("usage.columns.model")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("usage.columns.input")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("usage.columns.output")}</th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("usage.columns.cacheRead")}
                </th>
                <th className="px-3 py-2 text-right font-medium">
                  {t("usage.columns.cacheWrite")}
                </th>
                <th className="px-3 py-2 text-right font-medium">{t("usage.columns.cost")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("usage.columns.duration")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("usage.columns.status")}</th>
              </tr>
            </thead>
            <tbody className="text-[var(--color-theme-text)]">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={11}
                    className="px-3 py-8 text-center text-[var(--color-theme-text-muted)]"
                  >
                    {t("usage.empty.noData")}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[var(--color-theme-border)] last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-[var(--color-theme-text-muted)]">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {t(PURPOSE_LABEL_KEYS[row.purpose])}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2">{row.provider}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">{row.model}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.tokens.input)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.tokens.output)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.tokens.cacheRead)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatNumber(row.tokens.cacheWrite)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatUsd(row.rates.totalCostUsd)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatDuration(row.durationMs)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <LxTag size="small" color={STATUS_TAG_COLOR[row.status]}>
                        {t(STATUS_LABEL_KEYS[row.status])}
                      </LxTag>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[11px] text-[var(--color-theme-text-muted)]">
        <span>{t("usage.pagination.total", { count: total })}</span>
        <div className="flex items-center gap-1">
          <LxIconButton
            size="small"
            aria-label={t("usage.pagination.prev")}
            title={{ content: t("usage.pagination.prev"), placement: "top" }}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </LxIconButton>
          <span className="tabular-nums">
            {t("usage.pagination.pageInfo", { page, total: totalPages })}
          </span>
          <LxIconButton
            size="small"
            aria-label={t("usage.pagination.next")}
            title={{ content: t("usage.pagination.next"), placement: "top" }}
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      </div>
    </div>
  )
}
