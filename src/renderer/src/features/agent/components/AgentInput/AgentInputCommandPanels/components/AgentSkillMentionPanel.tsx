import type { SkillItem } from "@shared/contracts/agent"
import { Sparkles } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
import { panelClassName } from "../utils"

export interface AgentSkillMentionPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  skills: SkillItem[]
  activeIndex: number
  onSelect?: (skill: SkillItem) => void
}

/**
 * 渲染 Agent 输入框的 Skill 提及面板（$ 触发）。
 */
export const AgentSkillMentionPanel = ({
  isOpen,
  position,
  skills,
  activeIndex,
  onSelect,
}: AgentSkillMentionPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && skills.length > 0 ? { position, activeIndex, skills } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.skillMention")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.skills.map((skill, index) => {
            const isActive = index === displayData.activeIndex
            const description = skill.shortDescription || skill.description

            return (
              <LxCommandPanelItem
                key={skill.name}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2"
                index={index}
                leading={
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-[#7c3aed]/20 text-[#c084fc]">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                }
                onSelect={() => onSelect?.(skill)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                    <span className="font-mono font-medium">${skill.name}</span>
                    {skill.displayName && (
                      <span className="text-xs font-normal text-white/35">
                        ({skill.displayName})
                      </span>
                    )}
                  </span>
                  {description && (
                    <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                      {description}
                    </span>
                  )}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  <LxTag
                    bgClass="bg-[#7c3aed]/20 text-[#c084fc]"
                    className="pointer-events-none shrink-0"
                    size="small"
                  >
                    Skill
                  </LxTag>
                </div>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
