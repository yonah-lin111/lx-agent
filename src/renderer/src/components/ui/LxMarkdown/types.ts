import type React from "react"

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

// Markdown 编辑器属性。
export interface LxMarkdownEditorProps {
  initialContent?: string
  onChange?: (content: string) => void
  onSave?: () => void
  isSaved?: boolean
  // 是否显示右上角保存状态圆点并启用 Cmd/Ctrl+S 保存，默认隐藏与禁用。
  showSaveStatus?: boolean
  // 是否显示格式化工具栏，默认显示。
  showToolbar?: boolean
  // 编辑器整体高度（px）；不设置时随父容器 flex 撑满。
  height?: number
  // 高度自适应内容：编辑/预览区随内容伸缩，不内部滚动，超出时由外层容器滚动。
  autoHeight?: boolean
  showLineNumbers?: boolean
  showFolding?: boolean
}
