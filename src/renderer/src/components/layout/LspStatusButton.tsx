import { Code2, Loader2 } from "lucide-react"
import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useLspStatus } from "@/features/agent/hooks/useLspStatus"
import { useTranslation } from "@/i18n"

// 聚合状态颜色：全部安装绿 / 全部未装灰 / 部分缺失红（异常）/ 加载中淡灰。
const iconColor = (isLoading: boolean, installed: number, total: number): string => {
  if (isLoading) return "text-white/30"
  if (installed === 0) return "text-zinc-500"
  if (installed === total && total > 0) return "text-emerald-400"
  return "text-red-400"
}

/**
 * LspStatusButton - Agent 状态栏 LSP server 安装状态指示：
 * 采用 Icon + 数字 格式，Icon 颜色表达状态（绿=已装 / 红=缺失 / 灰=未配置），数字为已安装数。
 * hover 展示每包状态；存在缺失时点击弹出安装确认。
 */
export const LspStatusButton = (): React.JSX.Element => {
  const { summary, isLoading, isInstalling, lastResult, installMissing } = useLspStatus()
  const { t } = useTranslation()
  const needsInstall = summary.missing > 0
  const color = iconColor(isLoading, summary.installed, summary.total)

  const statusLines = summary.names.map((name) => {
    const installed = summary.installedNames.includes(name)
    return (
      <span
        key={name}
        className={`agent-status-tooltip-item truncate text-xs font-normal ${installed ? "text-emerald-400" : "text-red-400"}`}
      >
        {name}
      </span>
    )
  })

  const failedHint =
    lastResult && lastResult.failed.length > 0
      ? ` ${t("agent.lspInstallFailedPrefix", { names: lastResult.failed.join(", ") })}`
      : ""
  const tooltipContent = needsInstall ? (
    <span className="agent-status-tooltip-install text-sm leading-snug">
      {t("agent.lspInstallConfirm", {
        count: summary.missing,
        names: summary.missingNames.join(", "),
      })}
      {failedHint}
    </span>
  ) : (
    <div className="agent-status-tooltip flex min-w-[150px] max-w-[240px] flex-col gap-1.5">
      <span className="agent-status-tooltip-title text-[11px] font-semibold text-white/50">
        LSP servers · {summary.installed}/{summary.total}
      </span>
      {statusLines}
    </div>
  )

  return (
    <LxTooltip
      content={tooltipContent}
      contentClassName={needsInstall ? "!whitespace-normal" : "!p-2 !whitespace-normal"}
      placement="top"
      onConfirm={needsInstall ? () => void installMissing() : undefined}
    >
      <span
        aria-label={t("agent.lspStatusAria")}
        className={`agent-status-btn agent-lsp-status-btn flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-xs text-white/60 transition-colors hover:bg-white/5 ${needsInstall ? "cursor-pointer" : "cursor-default"}`}
      >
        {isInstalling ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/50" />
        ) : (
          <Code2 className={`h-3.5 w-3.5 shrink-0 ${color}`} />
        )}
        <span className="agent-status-count font-mono text-[11px] tabular-nums">
          {isLoading ? "…" : summary.installed}
        </span>
      </span>
    </LxTooltip>
  )
}
