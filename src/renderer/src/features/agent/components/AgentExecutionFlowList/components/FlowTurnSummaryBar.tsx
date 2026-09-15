import { Trash2 } from "lucide-react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { getModelDisplayName } from "@/features/agent/hooks/modelsStore"
import { useTranslation } from "@/i18n"
import {
  formatDurationMs,
  formatTokenCount,
  type ModelSettingsState,
  type TurnStats,
} from "../types"

type FlowTurnSummaryBarProps = {
  turnIndex: number
  turnStats?: TurnStats
  turnMessageId?: string
  canDeleteTurn: boolean
  onDeleteMessage?: (messageId: string) => void
  settings: ModelSettingsState
}

/**
 * 渲染 turn 结束时的综合执行数据统计与整轮删除按钮。
 */
export const FlowTurnSummaryBar = ({
  turnIndex,
  turnStats,
  turnMessageId,
  canDeleteTurn,
  onDeleteMessage,
  settings,
}: FlowTurnSummaryBarProps): React.JSX.Element => {
  const { t } = useTranslation()

  return (
    <div
      data-testid={`turn-summary-${turnIndex}`}
      className="agent-turn-summary flex flex-wrap items-center gap-1.5 py-1 pl-1 font-mono text-xs text-white/40"
    >
      {/* 删除整轮问答按钮：始终显示，位于模型名称左侧并同行 */}
      {canDeleteTurn && turnMessageId && (
        <LxTooltip
          hover={{
            content: t("agent.deleteTurn"),
            placement: "top",
          }}
          click={{
            content: t("agent.deleteTurnConfirm"),
            placement: "top",
            onConfirm: () => onDeleteMessage?.(turnMessageId),
          }}
        >
          <LxIconButton
            size="small"
            aria-label={t("agent.deleteTurn")}
            className="h-5 w-5 text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] hover:text-red-400"
          >
            <Trash2 />
          </LxIconButton>
        </LxTooltip>
      )}
      {turnStats?.model && (
        <LxTooltip placement="top" content={turnStats.model}>
          <span className="agent-turn-summary-pill agent-turn-summary-pill-model font-medium text-white/70">
            {getModelDisplayName(turnStats.model, undefined, settings)}
          </span>
        </LxTooltip>
      )}
      {turnStats?.variant && (
        <span className="agent-turn-summary-pill agent-turn-summary-pill-variant font-mono text-sky-300/90">
          {turnStats.variant}
        </span>
      )}
      {turnStats && turnStats.toolCallsCount > 0 && (
        <span className="agent-turn-summary-pill agent-turn-summary-pill-tools text-cyan-300/90">
          {t("agent.turnToolsCount", { count: turnStats.toolCallsCount })}
        </span>
      )}
      {turnStats && turnStats.inputTokens > 0 && (
        <span className="agent-turn-summary-pill agent-turn-summary-pill-input">
          {t("agent.turnInputTokens", {
            count: formatTokenCount(turnStats.inputTokens),
          })}
        </span>
      )}
      {turnStats && turnStats.outputTokens > 0 && (
        <span className="agent-turn-summary-pill agent-turn-summary-pill-output">
          {t("agent.turnOutputTokens", {
            count: formatTokenCount(turnStats.outputTokens),
          })}
        </span>
      )}
      {turnStats && turnStats.cacheReadTokens > 0 && turnStats.inputTokens > 0 && (
        <span className="agent-turn-summary-pill agent-turn-summary-pill-cache text-sky-300/90">
          {t("agent.turnCacheHit", {
            percent: Math.round(
              (turnStats.cacheReadTokens / (turnStats.inputTokens + turnStats.cacheReadTokens)) *
                100,
            ),
          })}
        </span>
      )}
      {turnStats && turnStats.durationMs > 0 && (
        <span className="agent-turn-summary-pill agent-turn-summary-pill-duration text-emerald-400/90">
          {t("agent.turnDuration", {
            duration: formatDurationMs(turnStats.durationMs),
          })}
        </span>
      )}
    </div>
  )
}
