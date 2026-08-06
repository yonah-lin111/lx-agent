import { LoaderCircle, Plug } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useMcpStatus } from "@/features/agent/hooks/useMcpStatus"

// 聚合状态颜色：全部正常绿 / 部分异常黄 / 全部异常红 / 无配置中性（对齐 memory agent 三态）。
const aggregateColor = (total: number, connected: number): string => {
  if (total === 0) return "text-white/30"
  if (connected === total) return "text-emerald-400"
  if (connected === 0) return "text-red-400"
  return "text-amber-400"
}

// 单个 server 名称状态颜色：连接绿 / 失败红 / 禁用中性。
const nameColor = (name: string, failedNames: string[], disabledNames: string[]): string => {
  if (failedNames.includes(name)) return "text-red-400"
  if (disabledNames.includes(name)) return "text-white/40"
  return "text-emerald-400"
}

/**
 * McpStatusButton - 顶部 MCP 连接状态指示：聚合 icon（Plug）按整体状态着色，
 * hover 通过 LxTooltip 展示每个 server 的连接状态与名称。
 */
export const McpStatusButton = (): React.JSX.Element => {
  const { summary, isLoading } = useMcpStatus()
  const color = aggregateColor(summary.total, summary.connected)

  const tooltipContent = (
    <div className="flex min-w-[150px] max-w-[240px] flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-white/50">
        MCP servers · {summary.connected}/{summary.total}
      </span>
      {isLoading ? (
        <span className="text-xs font-normal text-white/40">Checking MCP servers...</span>
      ) : summary.names.length > 0 ? (
        summary.names.map((name) => (
          <span
            key={name}
            className={`truncate text-xs font-normal ${nameColor(name, summary.failedNames, summary.disabledNames)}`}
          >
            {name}
          </span>
        ))
      ) : (
        <span className="text-xs font-normal text-white/40">No MCP servers configured</span>
      )}
    </div>
  )

  return (
    <LxTooltip
      content={tooltipContent}
      contentClassName="!p-2 !whitespace-normal"
      placement="bottom"
    >
      <LxIconButton aria-label="MCP 连接状态">
        {isLoading ? (
          <LoaderCircle className="h-4 w-4 animate-spin text-white/30" />
        ) : (
          <Plug className={`h-4 w-4 ${color}`} />
        )}
      </LxIconButton>
    </LxTooltip>
  )
}
