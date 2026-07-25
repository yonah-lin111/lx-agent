import type { CSSProperties } from "react"
import type { MarkdownBlockCommand } from "@/components/ui/LxMarkdown/markdownBlockCommands"

// Markdown 块命令菜单属性。
interface MarkdownBlockCommandMenuProps {
  commands: MarkdownBlockCommand[]
  activeIndex: number
  position: CSSProperties
  onActiveIndexChange: (index: number) => void
  onSelect: (command: MarkdownBlockCommand) => void
}

/**
 * 渲染紧贴编辑器光标的 Markdown 块命令菜单。
 */
export const MarkdownBlockCommandMenu = ({
  commands,
  activeIndex,
  position,
  onActiveIndexChange,
  onSelect,
}: MarkdownBlockCommandMenuProps): React.JSX.Element => (
  <div
    aria-label="Markdown 块命令"
    className="fixed z-50 w-64 overflow-hidden rounded-[6px] border border-white/10 bg-[#212121] p-1 shadow-xl"
    role="listbox"
    style={position}
  >
    {commands.map((command, index) => {
      const Icon = command.icon
      const isActive = index === activeIndex

      return (
        <button
          key={command.id}
          aria-selected={isActive}
          className={`flex h-11 w-full cursor-pointer items-center gap-2 rounded-[4px] px-2 text-left transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/60 ${
            isActive ? "bg-white/10" : "hover:bg-white/5"
          }`}
          role="option"
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onActiveIndexChange(index)}
          onClick={() => onSelect(command)}
        >
          <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[4px] bg-white/5 text-white/70">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] text-white">{command.label}</span>
            <span className="block truncate font-mono text-[11px] text-white/45">
              {command.preview}
            </span>
          </span>
        </button>
      )
    })}
  </div>
)
