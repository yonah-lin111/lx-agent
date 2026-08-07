import type { ProjectFileEntry } from "@shared/project"
import type React from "react"
import type { MarkdownTemplateFileKind } from "@/features/markdown/commands/markdownTemplateFileCommands"

// 表格网格尺寸。
export interface MarkdownTableSize {
  columns: number
  rows: number
}

// 表格列对齐方式。
export type MarkdownTableAlignment = "left" | "center" | "right"

// Markdown 快捷键说明。
export interface MarkdownShortcut {
  keys: string
  description: string
}

// 编辑器工具项配置。
export interface MarkdownToolbarAction {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  alignRight?: boolean
  highlighted?: boolean
  disabled?: boolean
}

// 编辑器视觉滚动锚点。
export interface EditorScrollAnchor {
  left: number
  line: number
  offset: number
}

// Markdown 编辑器显示模式。
export type MarkdownPreviewMode = "edit" | "preview" | "split"

// @ 文件提及候选项。
export type MarkdownFileMentionEntry = ProjectFileEntry & {
  mentionPath: string
  projectPath?: string
  source: "current" | "reference"
  // 模板块文件快捷输入的候选来源类型（@ 提及面板不使用）。
  templateKind?: MarkdownTemplateFileKind
}

// Markdown 页面数据。
export interface MarkdownPage {
  id: string
  name: string
  content: string
}

// Markdown 编辑器属性。
export interface LxMarkdownEditorProps {
  initialContent?: string
  pages?: MarkdownPage[]
  onChange?: (content: string) => void
  onPagesChange?: (pages: MarkdownPage[]) => void
  onSave?: () => void
  isSaved?: boolean
  pageMode?: boolean
  projectId?: string
  onSearchFiles?: (projectId: string, query: string) => Promise<ProjectFileEntry[]>
  onSearchReferencedFiles?: (
    projectPaths: string[],
    query: string,
  ) => Promise<Array<ProjectFileEntry & { projectPath: string }>>
  // 已启用（参与 @ 搜索）的共享文件夹绝对路径。
  referencedProjectPaths?: string[]
  showLineNumbers?: boolean
  showFolding?: boolean
}
