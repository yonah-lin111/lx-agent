import { LxTooltip } from "@/components/ui/LxTooltip"
import { useLspStatus } from "@/features/agent/hooks/useLspStatus"

// 聚合状态圆点颜色：全部安装绿 / 全部未装灰 / 部分缺失红（异常）。
const dotColor = (isLoading: boolean, installed: number, total: number): string => {
  if (isLoading) return "bg-white/30"
  if (installed === 0) return "bg-zinc-500"
  if (installed === total) return "bg-emerald-400"
  return "bg-red-400"
}

/**
 * LspStatusButton - Agent 状态栏 LSP server 安装状态指示：
 * 绿=全部已安装 / 红=部分缺失（异常）/ 灰=未安装，数字为已安装数。
 * hover 展示每包状态（绿=已装 / 红=缺失，无文字标签）；存在缺失时点击弹出安装确认，
 * 确认后一键安装（npm install -g），安装中圆点位置显示 loading。
 */
export const LspStatusButton = (): React.JSX.Element => {
  const { summary, isLoading, isInstalling, lastResult, installMissing } = useLspStatus()
  const needsInstall = summary.missing > 0
  const color = dotColor(isLoading, summary.installed, summary.total)

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
      ? `（上次失败：${lastResult.failed.join("、")}）`
      : ""
  const tooltipContent = needsInstall ? (
    <span className="agent-status-tooltip-install text-sm leading-snug">
      安装缺失的 LSP server（{summary.missing} 个）：{summary.missingNames.join("、")}
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
        aria-label="LSP 安装状态"
        className={`agent-status-btn agent-lsp-status-btn flex shrink-0 items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-xs text-white/50 transition-colors hover:bg-white/5 ${needsInstall ? "cursor-pointer" : "cursor-default"}`}
      >
        {isInstalling ? (
          <span className="agent-status-dot h-1.5 w-1.5 shrink-0 animate-spin rounded-full border border-white/50 border-t-transparent" />
        ) : (
          <span className={`agent-status-dot h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />
        )}
        <span className="agent-status-count tabular-nums">
          {isLoading ? "…" : summary.installed}
        </span>
        <span className="agent-status-label">LSP</span>
      </span>
    </LxTooltip>
  )
}
