import type { CSSProperties } from "react"
import type { MarkdownBlockCommand } from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"

// Markdown 块命令菜单属性。
interface MarkdownBlockCommandMenuProps {
  commands: MarkdownBlockCommand[]
  activeIndex: number
  position: CSSProperties
}

/**
 * 渲染紧贴编辑器光标的 Markdown 块命令菜单。
 */
export const MarkdownBlockCommandMenu = ({
  commands,
  activeIndex,
  position,
}: MarkdownBlockCommandMenuProps): React.JSX.Element => (
  <div
    aria-label="Markdown 块命令"
    className="pointer-events-none fixed z-50 w-64 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
    role="listbox"
    style={position}
  >
    {commands.map((command, index) => {
      const Icon = command.icon
      const isActive = index === activeIndex

      return (
        <div
          key={command.id}
          aria-selected={isActive}
          className={`flex h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left text-xs transition-colors ${
            isActive ? "bg-white/8 text-white" : "text-white/75"
          }`}
          role="option"
        >
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 text-white/70">
            <Icon className="h-3 w-3" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-[13px] leading-none text-white">{command.label}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-none text-white/45">
              {command.preview}
            </span>
          </span>
        </div>
      )
    })}
  </div>
)
