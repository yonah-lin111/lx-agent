import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import { LxTag } from "@/components/ui/LxTag"
import type { MarkdownSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"
import { getSlashCommandIcon } from "@/features/markdown/components/markdownCommandIcons"

// Markdown 斜杠命令菜单属性。
interface MarkdownSlashCommandMenuProps {
  commands?: MarkdownSlashCommand[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  onSelect?: (command: MarkdownSlashCommand) => void
}

const getCommandTags = (command: MarkdownSlashCommand): { label: string; bgClass: string }[] => {
  const tags: { label: string; bgClass: string }[] = []

  const isScopeBoth =
    command.scope === "both" ||
    (command.kind === "customTemplate" && command.customScope === "global")

  if (
    command.kind === "customTemplate" ||
    command.source === "project" ||
    command.source === "user"
  ) {
    // 作用域 Tag（MD / Template / MD & Template）
    if (isScopeBoth) {
      tags.push({ label: "MD / Template", bgClass: "bg-teal-500/20 text-teal-300" })
    } else if (command.customScope === "template" || command.scope === "template") {
      tags.push({ label: "Template", bgClass: "bg-purple-500/20 text-purple-300" })
    } else {
      tags.push({ label: "MD", bgClass: "bg-sky-500/20 text-sky-300" })
    }

    // 格式为 Custom|Global 或 Custom|Project
    const customSourceLabel = command.source === "project" ? "Custom|Project" : "Custom|Global"
    tags.push({ label: customSourceLabel, bgClass: "bg-amber-500/20 text-amber-300" })
  } else {
    // 内置命令：如果支持双作用域，打上 MD / Template 标记
    if (isScopeBoth) {
      tags.push({ label: "MD / Template", bgClass: "bg-teal-500/20 text-teal-300" })
    } else if (command.scope === "template") {
      tags.push({ label: "Template", bgClass: "bg-purple-500/20 text-purple-300" })
    } else if (command.scope === "varTemplate") {
      tags.push({ label: "Var", bgClass: "bg-sky-500/20 text-sky-300" })
    } else if (command.scope === "all") {
      tags.push({ label: "MD / Template / Var", bgClass: "bg-cyan-500/20 text-cyan-300" })
    }
    tags.push({ label: "Builtin", bgClass: "bg-white/10 text-white/50" })
  }

  return tags
}

/**
 * 渲染紧贴编辑器光标的 Markdown 模板命令菜单。
 */
export const MarkdownSlashCommandMenu = ({
  commands,
  activeIndex = 0,
  position,
  visible = false,
  onSelect,
}: MarkdownSlashCommandMenuProps): React.JSX.Element | null => {
  const panelData = commands && position ? { position, activeIndex, commands } : null

  return (
    <LxCommandPanel
      ariaLabel="Markdown 模板命令"
      className="markdown-command-menu markdown-command-menu--slash pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data={panelData}
      scrollActiveItem
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.commands.map((command, index) => {
            const isActive = index === displayData.activeIndex
            const tags = getCommandTags(command)

            return (
              <LxCommandPanelItem
                key={command.id}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2"
                index={index}
                leading={
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 text-[13px] text-white/70">
                    {getSlashCommandIcon(command)}
                  </span>
                }
                onSelect={() => onSelect?.(command)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-[13px] leading-none text-white">
                    {command.label}
                  </span>
                  {command.argumentHint && (
                    <span className="shrink-0 font-mono text-[11px] leading-none text-white/40">
                      {command.argumentHint}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[12px] leading-none text-white/45">
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
