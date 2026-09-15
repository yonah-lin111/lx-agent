import type { OpenClawSessionStats } from "@shared/contracts/openclaw"
import type React from "react"
import { useRef } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import type { ConversationAgent } from "./types"

export interface OpenClawAssistantMessageProps {
  agentId: string
  content: string
  error?: string
  agent?: ConversationAgent
  isStreaming?: boolean
  // 会话级模型与上下文用量；仅最新一条 AI 消息传入。
  stats?: OpenClawSessionStats
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

export const OpenClawAssistantMessage = ({
  agentId,
  content,
  error,
  agent,
  isStreaming = false,
  stats,
}: OpenClawAssistantMessageProps): React.JSX.Element => {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLElement | null>(null)
  const percent = stats ? contextPercentOf(stats) : null
  const formatCount = (value: number): string => Math.max(0, Math.round(value)).toLocaleString()

  // 名称右侧概要：模型名 + 上下文占用百分比（tooltip 展示明细）；均缺失时不渲染。
  const statsLabel =
    stats && (stats.model || percent !== null) ? (
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
              <div>
                {t("openclaw.contextCapacity", { total: formatCount(stats.contextWindow) })}
              </div>
            ) : null}
          </div>
        }
      >
        <span className="flex shrink-0 cursor-default items-center gap-1">
          {stats.model ? <span className="text-white/35">{stats.model}</span> : null}
          {stats.model && percent !== null ? <span className="text-white/20">·</span> : null}
          {percent !== null ? (
            <span className={`tabular-nums ${percentTextClass(percent)}`}>{percent}%</span>
          ) : null}
        </span>
      </LxTooltip>
    ) : null

  return (
    <div className="group flex min-w-0 w-full flex-col gap-1.5 px-0">
      <div className="flex w-fit items-center gap-1.5 px-1 leading-none">
        <span
          className="flex h-4 w-4 items-center justify-center rounded-[4px] text-[10px] font-semibold text-black/90 shadow-sm"
          style={{ backgroundColor: agent?.accent ?? "#4ecdc4" }}
        >
          {(agent?.name ?? agentId).slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[12px] font-medium text-white/70">{agent?.name ?? agentId}</span>
        {statsLabel}
      </div>

      <div
        data-assistant-bubble="true"
        className="relative min-w-0 max-w-full rounded-[18px] rounded-bl-[4px] bg-[#303030] px-3.5 py-2.5 text-[13px] text-white/90 shadow-sm"
      >
        {content ? (
          <LxMarkdownPreview
            html={markdownRenderer.render(content)}
            previewMode="preview"
            previewRef={previewRef}
            className="px-0"
            contentClassName="py-0"
            sanitizeCopy
          />
        ) : isStreaming ? (
          <div className="flex items-center gap-1.5 py-1 text-white/40">
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          </div>
        ) : null}

        {isStreaming && content ? (
          <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-sky-400/80 ml-1" />
        ) : null}

        {error ? <div className="mt-1 text-xs text-rose-300">{error}</div> : null}
      </div>
    </div>
  )
}
