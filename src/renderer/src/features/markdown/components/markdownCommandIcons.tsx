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
  Layers,
  ListPlus,
  Palette,
  PlusCircle,
  RefreshCw,
  ScrollText,
  Sparkles,
  SquareSlash,
} from "lucide-react"
import type React from "react"
import type { ReactNode } from "react"
import type { MarkdownSlashCommand } from "@/features/markdown/commands/markdownSlashCommands"
import { CliIcon } from "@/features/settings"

// 内置斜杠命令图标：模板命令与模板预设面板保持同一套语义。
const slashCommandIcons: Record<string, LucideIcon> = {
  addTemplate: PlusCircle,
  bugTemplate: Bug,
  refactorTemplate: RefreshCw,
  commonTemplate: CheckSquare,
  styleTemplate: Palette,
  suppleTemplate: ListPlus,
  logTemplate: ScrollText,
  varTemplate: Braces,
  templatePreset: Layers,
  applyPreset: Sparkles,
  summaryTitle: Heading,
  gitWorktree: GitBranch,
  singleLine: AlignLeft,
  multiLine: AlignVerticalJustifyStart,
}

// 模板预设图标与语义色。
const templatePresetIcons: Record<string, LucideIcon> = {
  add: PlusCircle,
  bug: Bug,
  refactor: RefreshCw,
  common: CheckSquare,
  style: Palette,
}

const templatePresetIconColors: Record<string, string> = {
  add: "text-emerald-400",
  bug: "text-rose-400",
  refactor: "text-amber-400",
  common: "text-sky-400",
  style: "text-purple-400",
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

/**
 * 渲染模板预设图标，保留各预设语义色，未知预设回退 Layers。
 */
export const getTemplatePresetIcon = (id: string): React.JSX.Element => {
  const Icon = templatePresetIcons[id] ?? Layers
  const color = templatePresetIconColors[id] ?? "text-indigo-400"
  return <Icon className={`h-3.5 w-3.5 ${color}`} />
}
