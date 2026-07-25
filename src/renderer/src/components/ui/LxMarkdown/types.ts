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

// Markdown 编辑器属性。
export interface LxMarkdownEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
  onSave?: () => void
  isSaved?: boolean
}
