// Markdown 模板命令标识。
export type MarkdownTemplateCommandId =
  | "addTemplate"
  | "bugTemplate"
  | "refactorTemplate"
  | "commonTemplate"
  | "styleTemplate"
  | "suppleTemplate"
  | "logTemplate"
  | "varTemplate"
  | "templatePreset"
  | "applyPreset"
  | "singleLine"
  | "multiLine"

// Markdown 斜杠命令标识。
export type MarkdownSlashCommandId =
  | MarkdownTemplateCommandId
  | "summaryTitle"
  | "gitWorktree"
  | "sendPrompt"
  | (string & {})

// Markdown /sendPrompt 目标标识。
export type MarkdownSendPromptTargetId =
  | "agent"
  | "claude"
  | "opencode"
  | "codex"
  | "gemini"
  | "agy"
  | "grok"

// Markdown /sendPrompt 标志位标识。
export type MarkdownSendPromptFlagId = "-enter"

// Markdown /sendPrompt 二级选择目标选项配置。
export interface MarkdownSendPromptOption {
  id: string
  targetType: MarkdownSendPromptTargetId
  instanceName?: string
  name: string
  label: string
  description: string
  tag: string
  isDefault?: boolean
  isRunning?: boolean
}

// Markdown /sendPrompt 三级运行选项配置。
export interface MarkdownSendPromptFlagOption {
  id: MarkdownSendPromptFlagId
  name: string
  label: string
  description: string
  tag: string
}

// Markdown 斜杠命令可用范围：normal = 模板块外（文档正文），template = 模板块内，varTemplate = 变量模板块内，both = 两者皆可。
export type MarkdownSlashCommandScope = "normal" | "template" | "varTemplate" | "both"

// Markdown 斜杠命令触发类型：
// - direct = 面板选中即插入内容；
// - confirm = 回显命令文本、二次回车触发；
// - select = 回显命令文本后打开二级选择面板，选中回显值、再回车触发；
// - customTemplate = 自定义命令：直接在光标处插入内容。
export type MarkdownSlashCommandKind = "direct" | "confirm" | "select" | "customTemplate"

// Markdown 斜杠命令来源类型。
export type MarkdownSlashCommandSource = "builtin" | "project" | "user"

// Markdown 斜杠命令配置。
export interface MarkdownSlashCommand {
  id: MarkdownSlashCommandId
  label: string
  description: string
  content: string
  cursorOffset: number
  selectionRange?: { start: number; end: number }
  scope: MarkdownSlashCommandScope
  kind: MarkdownSlashCommandKind
  source?: MarkdownSlashCommandSource
  customScope?: "global" | "template"
  argumentHint?: string
}

// 斜杠命令行范围。
export interface MarkdownSlashCommandLine {
  from: number
  to: number
  value: string
}

export interface TemplatePresetOption {
  id: string
  name: string
  label: string
  description: string
  content: string
}

export interface MarkdownSendPromptCommandParsed {
  target: MarkdownSendPromptTargetId
  instance: string | null
  flag: MarkdownSendPromptFlagId | null
}
