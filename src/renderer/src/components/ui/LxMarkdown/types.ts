import type { ProjectFileEntry } from "@shared/project"
import type React from "react"

// 表格网格尺寸。
export interface MarkdownTableSize {
  columns: number
  rows: number
}

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
}

// Markdown 编辑器属性。
export interface LxMarkdownEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
  onSave?: () => void
  isSaved?: boolean
  projectId?: string
  onSearchFiles?: (projectId: string, query: string) => Promise<ProjectFileEntry[]>
  onSearchReferencedFiles?: (
    projectPaths: string[],
    query: string,
  ) => Promise<Array<ProjectFileEntry & { projectPath: string }>>
  onFolderReferenceAdd?: (path: string) => void
  // 已启用（参与 @ 搜索）的共享文件夹绝对路径。
  referencedProjectPaths?: string[]
  showLineNumbers?: boolean
  showFolding?: boolean
}
