/**
 * Markdown 编辑器扩展统一门面导出入口。
 * 按职责拆分为独立子模块，各模块单文件行数均受控在规范范围内。
 */

export {
  markdownHighlightStyle,
  markdownReferenceHover,
} from "@/features/markdown/extensions/editorHighlight"
export {
  mapMarkdownPosition,
  selectAllPreservingScrollPosition,
  synchronizeEditorToPreview,
  synchronizePreviewToEditor,
} from "@/features/markdown/extensions/editorNavigation"
export { editorTheme } from "@/features/markdown/extensions/editorTheme"
export { markdownMarkerHighlight } from "@/features/markdown/extensions/markerPlugin"
export {
  createMarkdownTable,
  formatMarkdown,
} from "@/features/markdown/extensions/tableUtils"
