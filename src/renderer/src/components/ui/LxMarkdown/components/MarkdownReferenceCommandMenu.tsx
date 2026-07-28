import { FileText, FolderKanban, Image } from "lucide-react"
import type { CSSProperties } from "react"
import type { MarkdownReferenceCommand } from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"

// Markdown 引用命令面板属性。
interface MarkdownReferenceCommandMenuProps {
  commands: MarkdownReferenceCommand[]
  activeIndex: number
  position: CSSProperties
}

const commandIcons = {
  project: FolderKanban,
  file: FileText,
  image: Image,
}

const commandIconColors = {
  project: "text-violet-300",
  file: "text-sky-300",
  image: "text-pink-300",
}

/**
 * 渲染粘贴本地路径后的引用类型命令面板。
 */
export const MarkdownReferenceCommandMenu = ({
  commands,
  activeIndex,
  position,
}: MarkdownReferenceCommandMenuProps): React.JSX.Element => (
  <div
    aria-label="引用类型"
    className="pointer-events-none fixed z-50 w-64 overflow-hidden rounded-[6px] border border-white/10 bg-[#303030] p-1 text-[13px] shadow-[0_10px_28px_rgba(0,0,0,0.45)]"
    role="listbox"
    style={position}
  >
    {commands.map((command, index) => {
      const Icon = commandIcons[command.id]
      const isActive = index === activeIndex

      return (
        <div
          key={command.id}
          aria-selected={isActive}
          className={`flex h-11 w-full items-center gap-2 rounded-[4px] px-2 text-left transition-colors ${
            isActive ? "bg-white/8 text-white" : "text-white/75"
          }`}
          role="option"
        >
          <span
            className={`flex h-6 w-6 flex-none items-center justify-center rounded-[4px] bg-white/5 ${commandIconColors[command.id]}`}
          >
            <Icon className="h-3 w-3" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-[13px] leading-none text-white">{command.label}</span>
            <span className="min-w-0 flex-1 truncate text-[12px] leading-none text-white/45">
              {command.description}
            </span>
          </span>
        </div>
      )
    })}
  </div>
)
