import { FileText, Sparkles, SquareSlash } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import { useTranslation } from "@/i18n"
import type { AgentInputCommand } from "../types"
import { panelClassName } from "../utils"

// 命令类型对应的左侧图标与底色。
const commandKindStyles = {
  builtin: { icon: SquareSlash, className: "bg-white/5 text-white/70" },
  prompt: { icon: FileText, className: "bg-amber-500/20 text-amber-300" },
  skill: { icon: Sparkles, className: "bg-[#7c3aed]/20 text-[#c084fc]" },
} as const

interface AgentInputCommandPanelProps {
  isOpen: boolean
  position: CSSProperties | null
  commands: AgentInputCommand[]
  activeIndex: number
  onSelect?: (command: AgentInputCommand) => void
}

const getCommandTags = (command: AgentInputCommand): { label: string; bgClass: string }[] => {
  const tags: { label: string; bgClass: string }[] = []

  if (command.kind === "skill") {
    tags.push({ label: "Skill", bgClass: "bg-[#7c3aed]/20 text-[#c084fc]" })
  } else if (command.kind === "prompt") {
    const scopeLabel = command.source === "project" ? "Custom|Project" : "Custom|Global"
    tags.push({ label: scopeLabel, bgClass: "bg-amber-500/20 text-amber-300" })
  } else {
    tags.push({ label: "Builtin", bgClass: "bg-white/10 text-white/50" })
  }

  return tags
}

/**
 * 渲染 Agent 输入框的 Slash 命令面板。
 */
export const AgentInputCommandPanel = ({
  isOpen,
  position,
  commands,
  activeIndex,
  onSelect,
}: AgentInputCommandPanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && commands.length > 0 ? { position, activeIndex, commands } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.slashCommands")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.commands.map((command, index) => {
            const tags = getCommandTags(command)
            const isActive = index === displayData.activeIndex
            const kindStyle = commandKindStyles[command.kind ?? "builtin"]
            const CommandIcon = kindStyle.icon

            return (
              <LxCommandPanelItem
                key={command.id}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2"
                index={index}
                leading={
                  <span
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-[4px] ${kindStyle.className}`}
                  >
                    <CommandIcon className="h-3.5 w-3.5" />
                  </span>
                }
                onSelect={() => onSelect?.(command)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                    <span className="font-medium">{command.name}</span>
                    {command.argumentHint && (
                      <span className="text-xs font-normal text-white/35">
                        {command.argumentHint}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                    {command.description}
                  </span>
                </span>
                {tags.length > 0 && (
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {tags.map((tag) => (
                      <LxTag
                        key={tag.label}
                        bgClass={tag.bgClass}
                        className="pointer-events-none shrink-0"
                        size="small"
                      >
                        {tag.label}
                      </LxTag>
                    ))}
                  </div>
                )}
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
