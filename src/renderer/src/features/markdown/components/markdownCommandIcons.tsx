import type { LucideIcon } from "lucide-react"
import {
  AlignLeft,
  AlignVerticalJustifyStart,
  Braces,
  Bug,
  CheckSquare,
  FileText,
  GitBranch,
  Heading,
  ListPlus,
  Palette,
  PlusCircle,
  RefreshCw,
  ScrollText,
  SquareSlash,
} from "lucide-react"
import type { ReactNode } from "react"
import type { MarkdownSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"
import { CliIcon } from "@/features/settings"

// 内置斜杠命令图标：模板命令保持同一套语义。
const slashCommandIcons: Record<string, LucideIcon> = {
  addTemplate: PlusCircle,
  bugTemplate: Bug,
  refactorTemplate: RefreshCw,
  commonTemplate: CheckSquare,
  styleTemplate: Palette,
  suppleTemplate: ListPlus,
  logTemplate: ScrollText,
  varTemplate: Braces,
  addContent: FileText,
  summaryTitle: Heading,
  gitWorktree: GitBranch,
  singleLine: AlignLeft,
  multiLine: AlignVerticalJustifyStart,
}

// 未知内置命令兜底图标。
export const DEFAULT_SLASH_COMMAND_ICON = SquareSlash

/**
 * 解析斜杠命令左侧图标：自定义命令使用文件图标，内置命令按语义映射，未知命令兜底。
 */
export const getSlashCommandIcon = (command: MarkdownSlashCommand): ReactNode => {
  if (command.kind === "customTemplate") {
    return <FileText className="h-3 w-3" />
  }
  if (command.id === "sendPrompt") {
    return <CliIcon id="agent" className="h-3 w-3" />
  }

  const Icon = slashCommandIcons[command.id] ?? DEFAULT_SLASH_COMMAND_ICON
  return <Icon className="h-3 w-3" />
}
