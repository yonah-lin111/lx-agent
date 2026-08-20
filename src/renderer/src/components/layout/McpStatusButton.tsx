import type React from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useMcpStatus } from "@/features/agent/hooks/useMcpStatus"
import { useTranslation } from "@/i18n"

// 聚合状态圆点颜色：全部正常绿 / 部分异常黄 / 全部异常红 / 无配置中性（对齐 memory agent 三态）。
const aggregateColor = (total: number, connected: number): string => {
  if (total === 0) return "bg-white/30"
  if (connected === total) return "bg-emerald-400"
  if (connected === 0) return "bg-red-400"
  return "bg-amber-400"
}

// 单个 server 名称状态颜色：连接绿 / 失败红 / 禁用中性。
const nameColor = (name: string, failedNames: string[], disabledNames: string[]): string => {
  if (failedNames.includes(name)) return "text-red-400"
  if (disabledNames.includes(name)) return "text-white/40"
  return "text-emerald-400"
}

/**
 * McpStatusButton - Agent 状态栏 MCP 连接状态指示：状态圆点 + MCP 文本，
 * 圆点颜色聚合整体状态（绿/黄/红），hover 通过 LxTooltip 展示每个 server 的连接状态与名称。
 */
export const McpStatusButton = (): React.JSX.Element => {
  const { summary, isLoading } = useMcpStatus()
  const { t } = useTranslation()
  const color = aggregateColor(summary.total, summary.connected)

  const tooltipContent = (
    <div className="agent-status-tooltip flex min-w-[150px] max-w-[240px] flex-col gap-1.5">
      <span className="agent-status-tooltip-title text-[11px] font-semibold text-white/50">
        MCP servers · {summary.connected}/{summary.total}
      </span>
      {isLoading ? (
        <span className="agent-status-tooltip-loading text-xs font-normal text-white/40">
          Checking MCP servers...
        </span>
      ) : summary.names.length > 0 ? (
        summary.names.map((name) => (
          <span
            key={name}
            className={`agent-status-tooltip-item truncate text-xs font-normal ${nameColor(name, summary.failedNames, summary.disabledNames)}`}
          >
            {name}
          </span>
        ))
      ) : (
        <span className="agent-status-tooltip-empty text-xs font-normal text-white/40">
          No MCP servers configured
        </span>
      )}
    </div>
  )

  return (
    <LxTooltip content={tooltipContent} contentClassName="!p-2 !whitespace-normal" placement="top">
      <span
        aria-label={t("agent.mcpStatusAria")}
        className="agent-status-btn agent-mcp-status-btn flex shrink-0 cursor-default items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-xs text-white/50 transition-colors hover:bg-white/5"
      >
        <span
          className={`agent-status-dot h-1.5 w-1.5 shrink-0 rounded-full ${isLoading ? "bg-white/30" : color}`}
        />
        <span className="agent-status-count tabular-nums">
          {isLoading ? "…" : summary.connected}
        </span>
        <span className="agent-status-label">MCP</span>
      </span>
    </LxTooltip>
  )
}
