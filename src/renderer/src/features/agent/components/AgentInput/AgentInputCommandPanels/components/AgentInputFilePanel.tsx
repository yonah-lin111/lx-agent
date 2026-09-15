import { Bot, FileText, Folder, Palette, Sparkles, UserCog } from "lucide-react"
import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import { getMentionDirectoryTag } from "@/features/project/utils"
import { useTranslation } from "@/i18n"
import type { AgentMentionItem } from "../types"
import { panelClassName } from "../utils"

export interface AgentInputFilePanelProps {
  isOpen: boolean
  position: CSSProperties | null
  items: AgentMentionItem[]
  activeIndex: number
  worktreeName?: string
  onSelect?: (item: AgentMentionItem) => void
}

/**
 * 渲染 Agent 输入框的项目文件与技能提及面板。
 */
export const AgentInputFilePanel = ({
  isOpen,
  position,
  items,
  activeIndex,
  worktreeName,
  onSelect,
}: AgentInputFilePanelProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData =
    position !== null && items.length > 0 ? { position, activeIndex, items, worktreeName } : null

  return (
    <LxCommandPanel
      ariaLabel={t("agent.fileMention")}
      className={panelClassName}
      data={panelData}
      scrollActiveItem
      visible={isOpen}
    >
      {(displayData) => (
        <>
          {displayData.items.map((item, index) => {
            const isActive = index === displayData.activeIndex

            if (item.kind === "skill") {
              const { skill } = item
              const description = skill.shortDescription || skill.description

              return (
                <LxCommandPanelItem
                  key={`skill-${skill.name}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-[#7c3aed]/20 text-[#c084fc]">
                      <Sparkles className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
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
            }

            if (item.kind === "design") {
              const { design } = item
              const title = design.title || t("frontDesign.title")
              const lines = design.html ? design.html.split("\n").length : 0
              const modeLabel = design.mode === "css" ? "CSS" : "Tailwind"
              const versionLabel = design.version ? `v${design.version}` : undefined

              return (
                <LxCommandPanelItem
                  key={`design-${design.id}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-pink-500/20 text-pink-400">
                      <Palette className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-medium text-white truncate max-w-[220px]">{title}</span>
                      {versionLabel && (
                        <span className="rounded bg-pink-500/20 border border-pink-500/30 px-1 py-0.2 text-xs font-medium text-pink-300">
                          {versionLabel}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                      {lines} {t("frontDesign.lines")} · {modeLabel}
                    </span>
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass="bg-pink-500/20 text-pink-300"
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      Design
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            if (item.kind === "subagent") {
              const { subagent } = item
              return (
                <LxCommandPanelItem
                  key={`subagent-${subagent.name}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-sky-500/20 text-sky-300">
                      <UserCog className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-mono font-medium">@agent:{subagent.name}</span>
                    </span>
                    {subagent.description && (
                      <span className="min-w-0 flex-1 truncate text-xs leading-none text-white/45">
                        {subagent.description}
                      </span>
                    )}
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass={
                        subagent.builtIn
                          ? "bg-sky-500/20 text-sky-300"
                          : "bg-[#7c3aed]/20 text-[#c084fc]"
                      }
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      {subagent.builtIn
                        ? t("agent.subagentMentionTag")
                        : t("settings.subagentsCustomTag")}
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            if (item.kind === "claw") {
              const { claw } = item
              return (
                <LxCommandPanelItem
                  key={`claw-${claw.instanceId}/${claw.agentId}`}
                  active={isActive}
                  className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                  index={index}
                  leading={
                    <span className="flex h-5 w-5 flex-none items-center justify-center rounded-[4px] bg-sky-500/20 text-sky-400">
                      <Bot className="h-3.5 w-3.5" />
                    </span>
                  }
                  onSelect={() => onSelect?.(item)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="flex shrink-0 items-center gap-1.5 text-sm leading-none text-white">
                      <span className="font-medium text-white truncate max-w-[220px]">
                        {claw.name}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-xs leading-none text-white/45">
                      {claw.instanceId}/{claw.agentId}
                    </span>
                  </span>
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    <LxTag
                      bgClass="bg-sky-500/20 text-sky-300"
                      className="pointer-events-none shrink-0"
                      size="small"
                    >
                      {claw.instanceName}
                    </LxTag>
                  </div>
                </LxCommandPanelItem>
              )
            }

            const { file } = item
            const normalizedPath = file.path.replace(/\/$/, "")
            const slashIndex = normalizedPath.lastIndexOf("/")
            const name = normalizedPath.slice(slashIndex + 1)
            const directory = slashIndex < 0 ? "" : normalizedPath.slice(0, slashIndex)
            const Icon = file.isDirectory ? Folder : FileText
            const directoryTag = getMentionDirectoryTag(file.path)

            return (
              <LxCommandPanelItem
                key={`file-${file.path}`}
                active={isActive}
                className="flex min-h-11 items-center gap-2 px-2 py-1 text-xs"
                index={index}
                leading={<Icon className="h-4 w-4 shrink-0 text-[#eab308]" />}
                onSelect={() => onSelect?.(item)}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`min-w-0 flex-1 truncate ${isActive ? "text-white" : "text-white/75"}`}
                    >
                      {file.isDirectory ? `${name}/` : name}
                    </span>
                    {directoryTag && (
                      <LxTag
                        bgClass={directoryTag.bgClass}
                        className="pointer-events-none shrink-0"
                        size="small"
                      >
                        {directoryTag.label}
                      </LxTag>
                    )}
                    {displayData.worktreeName && (
                      <LxTag
                        bgClass="border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                        className="pointer-events-none shrink-0"
                        size="small"
                      >
                        {displayData.worktreeName}
                      </LxTag>
                    )}
                  </span>
                  {directory && (
                    <span className="block truncate text-xs text-white/40">{directory}</span>
                  )}
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
