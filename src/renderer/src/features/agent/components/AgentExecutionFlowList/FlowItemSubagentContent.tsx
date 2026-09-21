import type { SubagentData } from "@shared/contracts/agent"
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import {
  resolveSubagentDisplayStatus,
  type SubagentDisplayStatus,
  SubagentStatusRow,
} from "@/features/agent/components/blocks/SubagentStatusRow"
import type { ExecutionStepStatus, ExecutionSubagentContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { formatTokensShort } from "./types"

// 单项 Token 明细仅在终态展示：运行中数值持续跳动，且会与右侧汇总冲突。
const showItemUsage = (item: SubagentData, status: SubagentDisplayStatus): boolean =>
  status !== "running" &&
  (item.usage.input > 0 || item.usage.output > 0 || item.usage.cacheRead > 0)

export interface FlowItemSubagentContentProps {
  content: ExecutionSubagentContent
  // 批量扇出（tasks[]）：点击某项打开对应子代理面板（下标定位快照）。
  onOpenSubagentItem?: (subagentIndex: number) => void
  // 步骤整体状态：批量项快照缺少 status（旧数据）时的回退。
  fallbackStatus?: ExecutionStepStatus
}

export const FlowItemSubagentContent = ({
  content,
  onOpenSubagentItem,
  fallbackStatus = "done",
}: FlowItemSubagentContentProps): React.JSX.Element => {
  const { t } = useTranslation()
  const batch = content.subagents && content.subagents.length > 0 ? content.subagents : undefined

  // 批量汇总：完成数与并行 token 合计（终态优先，旧数据回退步骤状态）。
  const batchStats = useMemo(() => {
    if (!batch) return undefined
    let done = 0
    let totalTokens = 0
    for (const item of batch) {
      if (resolveSubagentDisplayStatus(item, fallbackStatus) === "done") done += 1
      totalTokens += item.usage.totalTokens
    }
    return { done, total: batch.length, totalTokens }
  }, [batch, fallbackStatus])

  return (
    <div className="agent-execution-flow-subagent-content flex flex-col gap-2 font-mono text-xs">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-white/70">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-white/40">Task:</span>
          <span className="truncate font-bold text-blue-300">{content.name}</span>
        </div>
        {batchStats && (
          <div className="flex shrink-0 items-center gap-2 tabular-nums text-white/40">
            <span>
              {t("agent.subagentBatchSummary", {
                done: batchStats.done,
                total: batchStats.total,
              })}
            </span>
            <span aria-hidden="true" className="opacity-40">
              ·
            </span>
            <span>Σ {formatTokensShort(batchStats.totalTokens)} tok</span>
          </div>
        )}
      </div>
      {batch && (
        <div className="agent-execution-flow-subagent-batch flex flex-col overflow-hidden rounded-[6px] border border-white/10 bg-black/20">
          {batch.map((item, index) => {
            const status = resolveSubagentDisplayStatus(item, fallbackStatus)
            return (
              <div
                key={item.subagentId ?? `${index}`}
                className="agent-execution-flow-subagent-item flex flex-col gap-0.5 border-white/5 px-2 py-1.5 not-first:border-t"
              >
                {/* 第一行：名称（角色）+ 状态图标 */}
                <button
                  type="button"
                  aria-label={t("agent.viewSubagentDetails")}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenSubagentItem?.(index)
                  }}
                  className="flex w-full items-center gap-2 text-left transition-colors hover:opacity-90 focus:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate text-blue-300">
                    {item.name.trim() || "task"}
                    {item.roleName && item.roleName !== item.name.trim() && (
                      <span className="text-blue-300/60"> ({item.roleName})</span>
                    )}
                  </span>
                  {status === "running" ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-400" />
                  ) : status === "error" ? (
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400/80" />
                  )}
                </button>

                {/* 第二行：直角图标 + 当前内部工具（运行中）或调用统计（完成后） */}
                <SubagentStatusRow
                  subagent={item}
                  status={status}
                  testId="flow-subagent-status-row"
                  className="agent-execution-flow-subagent-status-row"
                />

                {/* 第三行：该子代理 Token 明细（仅终态展示，运行中不跳动） */}
                {showItemUsage(item, status) && (
                  <div className="agent-execution-flow-subagent-usage flex items-center gap-1 text-xs tabular-nums text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))]">
                    <span aria-hidden className="w-3.5 shrink-0" />
                    <span>IN {formatTokensShort(item.usage.input)}</span>
                    <span aria-hidden className="opacity-40">
                      ·
                    </span>
                    <span>OUT {formatTokensShort(item.usage.output)}</span>
                    {item.usage.cacheRead > 0 && (
                      <>
                        <span aria-hidden className="opacity-40">
                          ·
                        </span>
                        <span>CACHE {formatTokensShort(item.usage.cacheRead)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {content.subagent?.prompt && (
        <div className="rounded bg-black/30 p-2 text-white/80">
          <div className="text-xs text-white/40 mb-0.5">Prompt:</div>
          <div className="whitespace-pre-wrap">{content.subagent.prompt}</div>
        </div>
      )}
      {content.subagent?.description && (
        <div className="text-white/50">{content.subagent.description}</div>
      )}
      {content.subagent?.usage && (
        <div className="flex gap-3 text-white/40 pt-1">
          <span>Input: {content.subagent.usage.input}</span>
          <span>Output: {content.subagent.usage.output}</span>
          <span>Total: {content.subagent.usage.totalTokens}</span>
        </div>
      )}
    </div>
  )
}
