import { MessageSquare } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
import type { AgentInputSessionItem } from "../types"
import { panelClassName } from "../utils"

const formatSessionTime = (dateStr?: string, justNowText = "Just now"): string => {
  if (!dateStr) return ""
  const time = new Date(dateStr).getTime()
  if (Number.isNaN(time)) return ""
  const diff = Date.now() - time
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return justNowText
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d`
  return new Date(time).toLocaleDateString()
}

export interface AgentInputSessionPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  sessions: AgentInputSessionItem[]
  activeIndex: number
  onSelect?: (session: AgentInputSessionItem) => void
}

/**
 * 渲染 Agent 输入框的会话选择面板（/session 触发）。
 */
export const AgentInputSessionPanel = ({
  isOpen,
  position,
  sessions,
  activeIndex,
  onSelect,
}: AgentInputSessionPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && sessions.length > 0 ? { position, activeIndex, sessions } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.sessionSelect")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.sessions.map((session, index) => {
            const isActive = index === displayData.activeIndex
            const timeDisplay = formatSessionTime(session.updatedAt, t("agent.justNow"))

            return (
              <LxCommandPanelItem
                key={session.id}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2 text-xs"
                index={index}
                leading={<MessageSquare className="h-3.5 w-3.5 shrink-0 text-sky-400/70" />}
                onSelect={() => onSelect?.(session)}
              >
                <span className="truncate font-medium text-white">
                  {session.title || t("agent.unnamedSession")}
                </span>
                {session.isCurrent && (
                  <LxTag
                    bgClass="bg-emerald-500/20 text-emerald-300"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    current
                  </LxTag>
                )}
                {timeDisplay && (
                  <span className="ml-auto shrink-0 text-xs text-white/35">{timeDisplay}</span>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
