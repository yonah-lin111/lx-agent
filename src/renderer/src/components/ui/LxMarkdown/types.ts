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

// 编辑器工具栏菜单项：点击后在光标处插入指定文本，可用 selectionOffset 指定插入后的光标位置。
export interface MarkdownToolbarMenuItem {
  label: string
  insertText: string
  selectionOffset?: number
}

// 编辑器工具栏菜单分组：带分组标题的菜单项集合。
export interface MarkdownToolbarMenuGroup {
  label: string
  items: MarkdownToolbarMenuItem[]
}

// 编辑器工具栏 select 型选项的光标上下文。
export interface MarkdownToolbarSelectContext {
  // 光标之前的文档文本，用于判断光标所处的块上下文。
  textBeforeCursor: string
}

// 编辑器工具栏 select 型选项：选中后在光标处插入指定文本。
export interface MarkdownToolbarSelectOption {
  label: string
  insertText: string
  selectionOffset?: number
  // 选项可用性判断（如临时块 / 记录块仅限任务块内部）；缺省恒可用。
  isAvailable?: (context: MarkdownToolbarSelectContext) => boolean
}

// 编辑器工具栏 select 型配置：选中即插入，不保持选中态。
export interface MarkdownToolbarSelect {
  placeholder: string
  options: MarkdownToolbarSelectOption[]
}

// 编辑器工具项配置。
export interface MarkdownToolbarAction {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick?: () => void
  alignRight?: boolean
  highlighted?: boolean
  disabled?: boolean
  // 下拉菜单：提供时按钮展开分组菜单，点击菜单项在光标处插入对应文本（用于插入模板块骨架等）。
  menu?: MarkdownToolbarMenuGroup[]
  // 下拉选择：提供时渲染为 select 控件，选中选项即在光标处插入对应文本。
  select?: MarkdownToolbarSelect
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
  // 追加到内置撤销/重做之后的工具栏工具项（支持 menu 分组菜单）。
  toolbarActions?: MarkdownToolbarAction[]
  // 编辑器整体高度（px）；不设置时随父容器 flex 撑满。
  height?: number
  // 高度自适应内容：编辑区随内容伸缩，不内部滚动，超出时由外层容器滚动。
  autoHeight?: boolean
  showLineNumbers?: boolean
  showFolding?: boolean
}
