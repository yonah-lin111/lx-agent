import type { OpenClawSessionStats } from "@shared/contracts/openclaw"
import { Network } from "lucide-react"
import type React from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  accentHexForIndex,
  OFFICE_STATUS_DOT_CLASS,
  OFFICE_STATUS_LABEL_KEY,
  useOfficeAgentStats,
  useOfficeAgentStatuses,
  useOpenClawConfig,
  useOpenClawOfficeStore,
} from "@/features/openclaw"
import { useTranslation } from "@/i18n"

export interface OpenClawLeftSideBarProps {
  isCollapsed?: boolean
}

// 上下文占用百分比；容量缺失或非法时返回 null。
const contextPercentOf = (stats: OpenClawSessionStats): number | null => {
  const { contextUsed, contextWindow } = stats
  if (contextUsed === undefined || contextWindow === undefined || contextWindow <= 0) return null
  return Math.min(100, Math.max(0, Math.round((contextUsed / contextWindow) * 100)))
}

// 百分比压力着色：≥90% 红 / ≥75% 琥珀 / 其余弱化。
const percentTextClass = (percent: number): string => {
  if (percent >= 90) return "text-rose-300/90"
  if (percent >= 75) return "text-amber-300/90"
  return "text-white/35"
}

/**
 * 员工会话统计行：模型名 + 上下文占用百分比（tooltip 展示明细）；均缺失时不渲染。
 */
const AgentStatsLine = ({
  stats,
}: {
  stats: OpenClawSessionStats | undefined
}): React.JSX.Element | null => {
  const { t } = useTranslation()
  if (!stats) return null
  const percent = contextPercentOf(stats)
  if (!stats.model && percent === null) return null
  const formatCount = (value: number): string => Math.max(0, Math.round(value)).toLocaleString()

  return (
    <LxTooltip
      placement="top"
      multiline
      content={
        <div className="flex flex-col gap-0.5">
          {stats.model ? (
            <div>
              {t("openclaw.modelLabel", { model: stats.model })}
              {stats.modelProvider ? ` · ${stats.modelProvider}` : ""}
            </div>
          ) : null}
          {stats.contextUsed !== undefined && stats.contextWindow !== undefined ? (
            <div>
              {t("openclaw.contextUsed", {
                used: formatCount(stats.contextUsed),
                total: formatCount(stats.contextWindow),
              })}
            </div>
          ) : stats.contextWindow !== undefined ? (
            <div>{t("openclaw.contextCapacity", { total: formatCount(stats.contextWindow) })}</div>
          ) : null}
        </div>
      }
    >
      <span className="flex min-w-0 items-center gap-1 text-xs text-white/35">
        {stats.model ? <span className="min-w-0 truncate">{stats.model}</span> : null}
        {stats.model && percent !== null ? <span className="text-white/20">·</span> : null}
        {percent !== null ? (
          <span className={`shrink-0 tabular-nums ${percentTextClass(percent)}`}>{percent}%</span>
        ) : null}
      </span>
    </LxTooltip>
  )
}

/**
 * 渲染 OpenClaw 页面专属左侧栏：办公区（实例）切换与员工名册（含状态灯）。
 */
export const OpenClawLeftSideBar = ({
  isCollapsed = false,
}: OpenClawLeftSideBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { instances, enabledInstances } = useOpenClawConfig()

  const selectedInstanceId = useOpenClawOfficeStore((state) => state.selectedInstanceId)
  const selectedAgentIds = useOpenClawOfficeStore((state) => state.selectedAgentIds)
  const selectOffice = useOpenClawOfficeStore((state) => state.selectOffice)
  const selectAgent = useOpenClawOfficeStore((state) => state.selectAgent)

  const currentInstance = selectedInstanceId ? instances[selectedInstanceId] : undefined
  const agents = currentInstance?.agents ?? []
  const agentIds = agents.map((agent) => agent.id)
  const statuses = useOfficeAgentStatuses(selectedInstanceId, agentIds)
  const agentStats = useOfficeAgentStats(selectedInstanceId, agentIds)

  const handleSelectOffice = (instanceId: string, firstAgentId?: string): void => {
    selectOffice(instanceId, firstAgentId)
  }

  if (isCollapsed) {
    return (
      <div className="flex h-full w-full min-w-0 flex-col items-center gap-3">
        <div className="flex h-7 shrink-0 items-center justify-center px-1" />
        <nav
          className="custom-scrollbar flex min-h-0 w-full flex-1 flex-col items-center space-y-1 overflow-y-auto pb-2"
          aria-label={t("openclaw.officesSection")}
        >
          {enabledInstances.map(({ id, instance }) => (
            <LxIconButton
              key={id}
              size="small"
              aria-current={id === selectedInstanceId ? "page" : undefined}
              aria-label={instance.name}
              title={{ content: instance.name, placement: "right" }}
              highlighted={id === selectedInstanceId}
              onClick={() => handleSelectOffice(id, instance.agents[0]?.id)}
            >
              <Network />
            </LxIconButton>
          ))}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      <div className="flex h-7 shrink-0 items-center justify-between pl-7 pr-1">
        <span className="truncate text-xs font-semibold text-white/80">{t("nav.openclaw")}</span>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]">
        {/* 办公区列表 */}
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-white/35">
            {t("openclaw.officesSection")}
          </p>
          {enabledInstances.length === 0 ? (
            <p className="px-1 py-1 text-xs text-white/40">{t("openclaw.noInstances")}</p>
          ) : (
            enabledInstances.map(({ id, instance }) => {
              const isActive = id === selectedInstanceId
              return (
                <button
                  key={id}
                  type="button"
                  data-active={isActive ? "true" : undefined}
                  onClick={() => handleSelectOffice(id, instance.agents[0]?.id)}
                  className={`openclaw-office-item flex w-full items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? "border-white/10 bg-white/[0.06]"
                      : "border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <Network
                    className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-sky-400" : "text-white/30"}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-white/80">{instance.name}</span>
                    <span className="block truncate text-xs text-white/40">{id}</span>
                  </span>
                  <LxTag size="small">{instance.agents.length}</LxTag>
                </button>
              )
            })
          )}
        </div>

        {/* 员工名册 */}
        <div className="space-y-1">
          <p className="px-1 text-xs font-medium uppercase tracking-wide text-white/35">
            {t("openclaw.rosterSection")}
          </p>
          {agents.length === 0 ? (
            <p className="px-1 py-1 text-xs text-white/40">{t("openclaw.noAgents")}</p>
          ) : (
            agents.map((agent, index) => {
              const status = statuses[agent.id] ?? "offline"
              const isSelected = selectedAgentIds.includes(agent.id)
              return (
                <button
                  key={agent.id}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={(event) =>
                    selectAgent(agent.id, { additive: event.ctrlKey || event.metaKey })
                  }
                  className={`openclaw-agent-item flex w-full items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left transition-colors ${
                    isSelected
                      ? "border-sky-400/30 bg-sky-400/10"
                      : "border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-xs font-medium text-black/80"
                    style={{ backgroundColor: accentHexForIndex(index) }}
                  >
                    {agent.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      <span className="min-w-0 flex-1 truncate text-xs text-white/80">
                        {agent.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${OFFICE_STATUS_DOT_CLASS[status]}`}
                        />
                        <span className="text-xs text-white/40">
                          {t(OFFICE_STATUS_LABEL_KEY[status])}
                        </span>
                      </span>
                    </span>
                    <AgentStatsLine stats={agentStats[agent.id]} />
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
