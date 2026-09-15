import type { CSSProperties } from "react"
import { LxCommandPanel, LxCommandPanelItem } from "@/components/ui/LxCommandPanel"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import { useTranslation } from "@/i18n"

// Markdown 块命令菜单属性。
interface MarkdownBlockCommandMenuProps {
  commands?: MarkdownBlockCommand[]
  activeIndex?: number
  position?: CSSProperties
  visible?: boolean
  ariaLabel?: string
  onSelect?: (command: MarkdownBlockCommand) => void
}

/**
 * 渲染紧贴编辑器光标的 Markdown 块命令菜单。
 */
export const MarkdownBlockCommandMenu = ({
  commands,
  activeIndex = 0,
  position,
  visible = false,
  ariaLabel,
  onSelect,
}: MarkdownBlockCommandMenuProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const panelData = commands && position ? { position, activeIndex, commands } : null

  return (
    <LxCommandPanel
      ariaLabel={ariaLabel ?? t("markdown.blockCommandsAria")}
      className="markdown-command-menu markdown-command-menu--block pointer-events-auto fixed z-50 overflow-y-auto rounded-[6px] border border-white/10 bg-[#303030] p-1 text-sm shadow-[0_10px_28px_rgba(0,0,0,0.45)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data={panelData}
      visible={visible}
    >
      {(displayData) => (
        <>
          {displayData.commands.map((command, index) => {
            const Icon = command.icon
            const isActive = index === displayData.activeIndex

            return (
              <LxCommandPanelItem
                key={command.id}
                active={isActive}
                className="flex h-11 items-center gap-2 px-2 text-xs"
                index={index}
                leading={
                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 text-white/70">
                    <Icon className="h-3 w-3" />
                  </span>
                }
                onSelect={() => onSelect?.(command)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 text-sm leading-none text-white">{command.label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs leading-none text-white/45">
                    {command.preview}
                  </span>
                </span>
              </LxCommandPanelItem>
            )
          })}
        </>
      )}
    </LxCommandPanel>
  )
}
