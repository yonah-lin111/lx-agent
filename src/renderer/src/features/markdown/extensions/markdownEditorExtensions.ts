import { HighlightStyle } from "@codemirror/language"
import { RangeSetBuilder, StateEffect } from "@codemirror/state"
import {
  Decoration,
  EditorView,
  hoverTooltip,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { createElement, Fragment } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  cycleMarkdownTemplateStatus,
  getMarkdownTemplateStatus,
  MARKDOWN_LOG_END_RE,
  MARKDOWN_LOG_START_RE,
  MARKDOWN_SUPPLE_END_RE,
  MARKDOWN_SUPPLE_START_RE,
  MARKDOWN_TEMPLATE_COMMENT_RE,
  type MarkdownTemplateStatus,
} from "@/features/markdown/commands/markdownBlockCommands"
import {
  getMarkdownReferenceImageSource,
  getMarkdownReferenceName,
  getMarkdownReferenceProjectPaths,
  getMarkdownReferenceType,
} from "@/features/markdown/commands/markdownReferenceCommands"
import { stripMarkdownSlashCommands } from "@/features/markdown/commands/markdownSlashCommands"
import {
  MarkdownActionCleanButton,
  MarkdownActionCopyButton,
  MarkdownActionDeleteButton,
  MarkdownActionFoldButton,
  TemplateStatusButton,
} from "@/features/markdown/extensions/markdownActionWidgets"
import {
  isPathUnderReferencedRoots,
  MARKDOWN_FILE_MENTION_PATTERN,
} from "@/features/markdown/extensions/markdownFileMentions"
import type { MarkdownTableAlignment, MarkdownTableSize } from "@/features/markdown/types"
import {
  stripEmptyTemplateItems,
  stripMarkdownSuppleBlocks,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "#212121",
      color: "#e5e5e5",
      fontSize: "14px",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "12px 16px calc(50cqh - 0.925em - 12px)",
      caretColor: "#ffffff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: "1.65",
    },
    ".cm-line": {
      // 内容行高
      lineHeight: "1.85",
      // 作为行内操作按钮（代码块/模板块右上角）的定位参照，实现垂直居中。
      position: "relative",
    },
    ".cm-scroller": {
      containerType: "size",
      overflow: "auto",
      scrollbarGutter: "stable",
    },
    ".cm-gutters": {
      minHeight: "100%",
      borderRight: "1px solid rgba(255, 255, 255, 0.05)",
      backgroundColor: "#212121",
      color: "rgba(255, 255, 255, 0.3)",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      paddingLeft: "10px",
      paddingRight: "6px",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "flex-end",
      boxSizing: "border-box",
      height: "1.65em",
      lineHeight: "1.65em",
    },
    ".cm-foldGutter .cm-gutterElement": {
      cursor: "pointer",
      color: "rgba(255, 255, 255, 0.35)",
      transition: "color 0.15s ease",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      paddingLeft: "4px",
      paddingRight: "8px",
      boxSizing: "border-box",
    },
    ".cm-gutters > .cm-foldGutter:first-child .cm-gutterElement": {
      paddingLeft: "8px",
      paddingRight: "8px",
    },
    ".cm-foldGutter .cm-gutterElement:hover": {
      color: "#ffffff",
    },
    ".cm-fold-marker": {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "12px",
      height: "1.65em",
      color: "currentColor",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "rgba(255, 255, 255, 0.08)",
      border: "none",
      color: "rgba(255, 255, 255, 0.5)",
      borderRadius: "3px",
      padding: "2px 4px",
      margin: "0 4px",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      verticalAlign: "middle",
      userSelect: "none",
      transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    },
    ".cm-foldPlaceholder:hover": {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
      color: "#ffffff",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(255, 255, 255, 0.035)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#ffffff",
    },
    ".cm-tooltip": {
      backgroundColor: "#2b2b2b",
      border: "1px solid rgba(255, 255, 255, 0.12)",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
      padding: "6px",
      zIndex: 100,
    },
    ".cm-md-heading-marker, .cm-md-heading-marker *": {
      color: "#e9a339 !important",
      fontWeight: "700",
    },
    ".cm-md-strong-marker, .cm-md-strong-marker *": {
      color: "#fb923c !important",
      fontWeight: "700",
    },
    ".cm-md-emphasis-marker, .cm-md-emphasis-marker *": {
      color: "#f472b6 !important",
      fontWeight: "700",
    },
    ".cm-md-table-marker, .cm-md-table-marker *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
    },
    ".cm-md-task-marker, .cm-md-task-marker *": {
      color: "#a3e635 !important",
      fontWeight: "700",
    },
    ".cm-md-unordered-list-marker, .cm-md-unordered-list-marker *": {
      color: "#2dd4bf !important",
      fontWeight: "700",
    },
    ".cm-md-ordered-list-marker, .cm-md-ordered-list-marker *": {
      color: "#c084fc !important",
      fontWeight: "700",
    },
    ".cm-md-code-fence-marker, .cm-md-code-fence-marker *": {
      color: "#e879f9 !important",
      fontWeight: "700",
    },
    ".cm-md-template-marker, .cm-md-template-marker *": {
      color: "#818cf8 !important",
      fontWeight: "700",
    },
    ".cm-md-template-command, .cm-md-template-command *": {
      color: "#c4b5fd !important",
      fontWeight: "700",
      backgroundColor: "rgba(196, 181, 253, 0.12) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-template-command-addTemplate, .cm-md-template-command-addTemplate *": {
      color: "#34d399 !important",
      backgroundColor: "rgba(52, 211, 153, 0.15) !important",
    },
    ".cm-md-template-command-bugTemplate, .cm-md-template-command-bugTemplate *": {
      color: "#fb7185 !important",
      backgroundColor: "rgba(251, 113, 133, 0.15) !important",
    },
    ".cm-md-template-command-refactorTemplate, .cm-md-template-command-refactorTemplate *": {
      color: "#c084fc !important",
      backgroundColor: "rgba(192, 132, 252, 0.15) !important",
    },
    ".cm-md-template-command-commonTemplate, .cm-md-template-command-commonTemplate *": {
      color: "#38bdf8 !important",
      backgroundColor: "rgba(56, 189, 248, 0.15) !important",
    },
    ".cm-md-template-command-styleTemplate, .cm-md-template-command-styleTemplate *": {
      color: "#f472b6 !important",
      backgroundColor: "rgba(244, 114, 182, 0.15) !important",
    },
    ".cm-md-template-title, .cm-md-template-title *": {
      color: "#fde68a !important",
      backgroundColor: "rgba(253, 230, 138, 0.18) !important",
      textDecoration: "underline",
      textDecorationColor: "rgba(253, 230, 138, 0.6)",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-bracket-content-marker, .cm-md-bracket-content-marker *": {
      textDecoration: "underline",
      textDecorationColor: "rgba(255, 255, 255, 0.4)",
    },
    ".cm-md-template-done, .cm-md-template-done *": {
      color: "#34d399 !important",
      backgroundColor: "rgba(52, 211, 153, 0.15) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-template-in-progress, .cm-md-template-in-progress *": {
      color: "#fbbf24 !important",
      backgroundColor: "rgba(251, 191, 36, 0.15) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-template-id, .cm-md-template-id *": {
      color: "#f0abfc !important",
      backgroundColor: "rgba(240, 171, 252, 0.14) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
      fontWeight: "600 !important",
    },
    ".cm-md-template-wt, .cm-md-template-wt *": {
      color: "#22d3ee !important",
      backgroundColor: "rgba(34, 211, 238, 0.14) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
      fontWeight: "600 !important",
    },
    ".cm-md-code-fence-language, .cm-md-code-fence-language *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
      backgroundColor: "rgba(56, 189, 248, 0.12) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-code-fence-start-line": {
      borderTop: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderLeft: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderRight: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.035)",
      boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 3px 6px rgba(0, 0, 0, 0.3)",
      paddingLeft: "8px",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-code-fence-middle-line": {
      borderLeft: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderRight: "1.5px solid rgba(255, 255, 255, 0.15)",
      backgroundColor: "rgba(255, 255, 255, 0.035)",
      boxShadow: "inset 1px 0 0 rgba(255, 255, 255, 0.08), inset -1px 0 0 rgba(0, 0, 0, 0.4)",
      paddingLeft: "8px",
    },
    ".cm-md-code-fence-end-line": {
      borderBottom: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderLeft: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderRight: "1.5px solid rgba(255, 255, 255, 0.15)",
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.035)",
      boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.5), 0 3px 6px rgba(0, 0, 0, 0.3)",
      paddingLeft: "8px",
      paddingBottom: "4px",
    },
    ".cm-md-template-start-line": {
      borderTop: "1.5px solid rgba(129, 140, 248, 0.45)",
      borderLeft: "2px solid rgba(129, 140, 248, 0.45)",
      borderRight: "2px solid rgba(129, 140, 248, 0.45)",
      borderBottom: "1px solid rgba(129, 140, 248, 0.25)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      backgroundColor: "rgba(129, 140, 248, 0.06)",
      boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 10px rgba(0, 0, 0, 0.35)",
      paddingLeft: "8px",
      // 模板块操作按钮绝对定位在行末，预留空间避免遮挡标题。
      paddingRight: "96px",
      boxSizing: "border-box",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-template-middle-line": {
      borderLeft: "2px solid rgba(129, 140, 248, 0.45)",
      borderRight: "2px solid rgba(129, 140, 248, 0.45)",
      backgroundColor: "rgba(129, 140, 248, 0.06)",
      boxShadow: "inset 1px 0 0 rgba(255, 255, 255, 0.08), inset -1px 0 0 rgba(0, 0, 0, 0.4)",
      paddingLeft: "8px",
    },
    ".cm-md-template-end-line": {
      borderBottom: "2px solid rgba(129, 140, 248, 0.45)",
      borderLeft: "2px solid rgba(129, 140, 248, 0.45)",
      borderRight: "2px solid rgba(129, 140, 248, 0.45)",
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      backgroundColor: "rgba(129, 140, 248, 0.06)",
      boxShadow: "inset 0 -1px 0 rgba(0, 0, 0, 0.5), 0 4px 10px rgba(0, 0, 0, 0.35)",
      paddingLeft: "8px",
      paddingBottom: "4px",
    },
    ".cm-md-template-comment-line": {
      borderLeft: "2px solid rgba(129, 140, 248, 0.45)",
      borderRight: "2px solid rgba(129, 140, 248, 0.45)",
      backgroundColor: "rgba(129, 140, 248, 0.06)",
      boxShadow: "inset 1px 0 0 rgba(255, 255, 255, 0.08), inset -1px 0 0 rgba(0, 0, 0, 0.4)",
      paddingLeft: "8px",
    },
    ".cm-md-template-comment-line, .cm-md-template-comment-line *": {
      color: "#6b7280 !important",
      fontStyle: "italic !important",
    },
    ".cm-md-template-line-in-progress": {
      borderColor: "rgba(251, 191, 36, 0.35) !important",
    },
    ".cm-md-template-line-done": {
      borderColor: "rgba(52, 211, 153, 0.35) !important",
    },
    ".cm-md-template-hidden-line": {
      display: "none !important",
    },
    ".cm-md-supple-hidden-line": {
      display: "none !important",
    },
    ".cm-md-log-hidden-line": {
      display: "none !important",
    },
    ".cm-md-supple-command, .cm-md-supple-command *": {
      color: "#38bdf8 !important",
      backgroundColor: "rgba(56, 189, 248, 0.15) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
      fontWeight: "700 !important",
    },
    ".cm-md-supple-marker, .cm-md-supple-marker *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
    },
    ".cm-md-supple-start-line": {
      borderTop: "1.5px solid rgba(56, 189, 248, 0.45)",
      borderLeft: "2px solid rgba(56, 189, 248, 0.45)",
      borderRight: "2px solid rgba(56, 189, 248, 0.45)",
      borderBottom: "1px solid rgba(56, 189, 248, 0.25)",
      borderTopLeftRadius: "4px",
      borderTopRightRadius: "4px",
      backgroundColor: "rgba(56, 189, 248, 0.05)",
      paddingLeft: "8px",
      // 操作按钮绝对定位在行末，预留空间避免遮挡。
      paddingRight: "72px",
      boxSizing: "border-box",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-supple-middle-line": {
      borderLeft: "2px solid rgba(56, 189, 248, 0.45)",
      borderRight: "2px solid rgba(56, 189, 248, 0.45)",
      backgroundColor: "rgba(56, 189, 248, 0.05)",
      paddingLeft: "8px",
    },
    ".cm-md-supple-end-line": {
      borderBottom: "1.5px solid rgba(56, 189, 248, 0.45)",
      borderLeft: "2px solid rgba(56, 189, 248, 0.45)",
      borderRight: "2px solid rgba(56, 189, 248, 0.45)",
      borderBottomLeftRadius: "4px",
      borderBottomRightRadius: "4px",
      backgroundColor: "rgba(56, 189, 248, 0.05)",
      paddingLeft: "8px",
      paddingBottom: "4px",
    },
    ".cm-md-log-command, .cm-md-log-command *": {
      color: "#2dd4bf !important",
      backgroundColor: "rgba(45, 212, 191, 0.15) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
      fontWeight: "700 !important",
    },
    ".cm-md-log-marker, .cm-md-log-marker *": {
      color: "#2dd4bf !important",
      fontWeight: "700",
    },
    ".cm-md-log-start-line": {
      borderTop: "1.5px solid rgba(45, 212, 191, 0.45)",
      borderLeft: "2px solid rgba(45, 212, 191, 0.45)",
      borderRight: "2px solid rgba(45, 212, 191, 0.45)",
      borderBottom: "1px solid rgba(45, 212, 191, 0.25)",
      borderTopLeftRadius: "4px",
      borderTopRightRadius: "4px",
      backgroundColor: "rgba(45, 212, 191, 0.05)",
      paddingLeft: "8px",
      // 操作按钮绝对定位在行末，预留空间避免遮挡。
      paddingRight: "72px",
      boxSizing: "border-box",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-log-middle-line": {
      borderLeft: "2px solid rgba(45, 212, 191, 0.45)",
      borderRight: "2px solid rgba(45, 212, 191, 0.45)",
      backgroundColor: "rgba(45, 212, 191, 0.05)",
      paddingLeft: "8px",
    },
    ".cm-md-log-end-line": {
      borderBottom: "1.5px solid rgba(45, 212, 191, 0.45)",
      borderLeft: "2px solid rgba(45, 212, 191, 0.45)",
      borderRight: "2px solid rgba(45, 212, 191, 0.45)",
      borderBottomLeftRadius: "4px",
      borderBottomRightRadius: "4px",
      backgroundColor: "rgba(45, 212, 191, 0.05)",
      paddingLeft: "8px",
      paddingBottom: "4px",
    },
    ".cm-md-inline-code-marker, .cm-md-inline-code-marker *": {
      color: "#fb7185 !important",
      fontWeight: "700",
    },
    ".cm-md-quote-marker, .cm-md-quote-marker *": {
      color: "#a5b4fc !important",
      fontWeight: "700",
    },
    ".cm-md-link-marker, .cm-md-link-marker *": {
      color: "#86efac !important",
      fontWeight: "700",
    },
    ".cm-md-strike-marker, .cm-md-strike-marker *": {
      color: "#fda4af !important",
      fontWeight: "700",
    },
    ".cm-md-separator-marker, .cm-md-separator-marker *": {
      color: "#fde047 !important",
      fontWeight: "700",
    },
    ".cm-md-file-mention, .cm-md-file-mention *": {
      color: "#eab308 !important",
      fontWeight: "500",
      textDecoration: "underline",
      textDecorationColor: "rgba(234, 179, 8, 0.4)",
    },
    ".cm-md-referenced-file-mention, .cm-md-referenced-file-mention *": {
      color: "#c4b5fd !important",
      fontWeight: "500",
      textDecoration: "underline",
      textDecorationColor: "rgba(196, 181, 253, 0.4)",
    },
    ".cm-md-reference-project, .cm-md-reference-project *": {
      color: "#c4b5fd !important",
      fontWeight: "500",
    },
    ".cm-md-reference-folder, .cm-md-reference-folder *": {
      color: "#d97706 !important",
      fontWeight: "500",
    },
    ".cm-md-reference-file, .cm-md-reference-file *": {
      color: "#7dd3fc !important",
      fontWeight: "500",
    },
    ".cm-md-reference-image, .cm-md-reference-image *": {
      color: "#f9a8d4 !important",
      fontWeight: "500",
    },
    ".cm-md-reference-common, .cm-md-reference-common *": {
      color: "#cbd5e1 !important",
      fontWeight: "500",
    },
    ".cm-md-code-fence-hidden-line": {
      display: "none !important",
    },
    ".cm-md-code-fence-start-line .cm-monospace, .cm-md-code-fence-middle-line .cm-monospace, .cm-md-code-fence-end-line .cm-monospace, .cm-md-template-start-line .cm-monospace, .cm-md-template-middle-line .cm-monospace, .cm-md-template-end-line .cm-monospace, .cm-md-template-comment-line .cm-monospace":
      {
        color: "inherit !important",
        backgroundColor: "transparent !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
    ".cm-md-code-fence-start-line span:not(.cm-md-code-fence-language):not(.markdown-file-mention-node), .cm-md-code-fence-middle-line span:not(.markdown-file-mention-node), .cm-md-code-fence-end-line span:not(.markdown-file-mention-node), .cm-md-template-start-line span:not(.cm-md-template-command):not(.cm-md-template-done):not(.cm-md-template-title):not(.markdown-file-mention-node), .cm-md-template-middle-line span:not(.markdown-file-mention-node), .cm-md-template-end-line span:not(.cm-md-template-done):not(.cm-md-template-id):not(.cm-md-template-wt):not(.markdown-file-mention-node), .cm-md-template-comment-line span:not(.markdown-file-mention-node)":
      {
        backgroundColor: "transparent !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
  },
  { dark: true },
)

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#e9a339", fontWeight: "700" },
  { tag: tags.heading1, color: "#e9a339", fontSize: "1.5em" },
  { tag: tags.heading2, color: "#e9a339", fontSize: "1.3em" },
  { tag: tags.heading3, color: "#e9a339", fontSize: "1.15em" },
  { tag: tags.heading4, color: "#e9a339", fontSize: "1.08em" },
  { tag: tags.heading5, color: "#e9a339", fontSize: "1.03em" },
  { tag: tags.heading6, color: "#e9a339", fontSize: "1.0em" },
  { tag: tags.emphasis, color: "#fcd34d", fontStyle: "italic" },
  { tag: tags.strong, color: "#f59e0b", fontWeight: "700" },
  { tag: tags.strikethrough, color: "#fda4af", textDecoration: "line-through" },
  { tag: tags.link, color: "#93c5fd", textDecoration: "underline" },
  { tag: tags.url, color: "#67e8f9" },
  { tag: tags.quote, color: "#c4b5fd", fontStyle: "italic" },
  {
    tag: tags.monospace,
    color: "#fca5a5",
    backgroundColor: "rgba(252, 165, 165, 0.12)",
    borderRadius: "3px",
    padding: "1px 4px",
  },
  { tag: [tags.meta, tags.processingInstruction], color: "#7dd3fc" },
  { tag: tags.keyword, color: "#c4b5fd" },
  { tag: tags.string, color: "#86efac" },
  { tag: tags.number, color: "#fda4af" },
  { tag: tags.comment, color: "#94a3b8", fontStyle: "italic" },
  { tag: tags.variableName, color: "#e2e8f0" },
  { tag: tags.typeName, color: "#67e8f9" },
  { tag: tags.propertyName, color: "#93c5fd" },
  { tag: tags.operator, color: "#fcd34d" },
])

// 代码块或模板块折叠状态变更事件。
const markdownBlockFoldToggleEffect = StateEffect.define<void>()

// 引用语法模式：@[refer-type](path)
const MARKDOWN_REFERENCE_PATTERN = /@\[(refer-[a-z]+)\]\(((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g

/**
 * 构建引用图片 hover tooltip 的 DOM：仅图片预览。
 * 图片加载完成后触发 onSizeChange，让 CodeMirror 重新测量定位。
 */
const buildMarkdownReferenceImageTooltipDom = (
  path: string,
  onSizeChange?: () => void,
): HTMLElement => {
  const wrap = document.createElement("div")
  wrap.className = "w-fit min-w-40 max-w-[min(30rem,calc(100vw-1rem))]"

  const img = document.createElement("img")
  img.alt = getMarkdownReferenceName(path)
  img.className = "mx-auto block h-auto max-h-90 max-w-full rounded-[4px] object-contain"
  img.src = getMarkdownReferenceImageSource(path)
  img.onload = () => onSizeChange?.()
  img.onerror = () => {
    onSizeChange?.()
    wrap.replaceChildren()
    const fallback = document.createElement("span")
    fallback.className = "whitespace-nowrap"
    fallback.textContent = "图片加载失败"
    wrap.appendChild(fallback)
  }
  wrap.appendChild(img)
  return wrap
}

/**
 * 编辑器内 hover 引用图片时显示图片预览 tooltip，不影响文本渲染。
 * 方向在 hover 时按触发位置一次性确定并固定（strictSide），
 * 避免图片加载后高度变化触发 CodeMirror 自动翻转导致浮层上下跳转；
 * 图片加载完成后请求重测，使浮层贴合图片真实尺寸。
 */
export const markdownReferenceHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos)
  const relative = pos - line.from

  MARKDOWN_REFERENCE_PATTERN.lastIndex = 0
  for (const match of line.text.matchAll(MARKDOWN_REFERENCE_PATTERN)) {
    if (match.index === undefined) continue
    const start = match.index
    const end = start + match[0].length
    if (relative < start || relative >= end) continue

    const type = getMarkdownReferenceType(match[1] ?? "")
    if (type !== "image") return null

    const from = line.from + start
    const coords = view.coordsAtPos(pos)
    const editorRect = view.dom.getBoundingClientRect()
    const above = coords ? coords.top - editorRect.top > editorRect.height / 2 : true
    return {
      pos: from,
      end: line.from + end,
      above,
      strictSide: true,
      create: () => ({
        dom: buildMarkdownReferenceImageTooltipDom(match[2] ?? "", () => view.requestMeasure()),
      }),
    }
  }
  return null
})

// 模板块状态切换配置。
interface TemplateStatusAction {
  line: number
  status: MarkdownTemplateStatus
  onToggle: (line: number) => void
}

class CodeBlockActionWidget extends WidgetType {
  private reactRoot: Root | null = null

  constructor(
    readonly codeText: string,
    readonly isFolded: boolean,
    readonly onToggleFold: () => void,
    readonly showFoldBtn = true,
    readonly actionClassName = "cm-code-block-action-wrap",
    readonly copyTitle?: string,
    readonly foldTitle?: string,
    readonly unfoldTitle?: string,
    readonly templateStatus: TemplateStatusAction | null = null,
    readonly templateStartLine: number | null = null,
    readonly onDeleteTemplate: (() => void) | null = null,
    readonly onCleanTemplate: (() => void) | null = null,
    readonly isSupple = false,
    readonly isLog = false,
  ) {
    super()
  }

  eq(other: CodeBlockActionWidget) {
    return (
      this.codeText === other.codeText &&
      this.isFolded === other.isFolded &&
      this.showFoldBtn === other.showFoldBtn &&
      this.actionClassName === other.actionClassName &&
      this.templateStatus?.line === other.templateStatus?.line &&
      this.templateStatus?.status === other.templateStatus?.status &&
      this.templateStartLine === other.templateStartLine &&
      this.isSupple === other.isSupple &&
      this.isLog === other.isLog
    )
  }

  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = this.actionClassName
    wrap.style.position = "absolute"
    wrap.style.top = "50%"
    wrap.style.right = "12px"
    wrap.style.display = "inline-flex"
    wrap.style.alignItems = "center"
    wrap.style.gap = "6px"
    wrap.style.background = "transparent"
    wrap.style.border = "none"
    wrap.style.borderRadius = "4px"
    wrap.style.padding = "2px 4px"
    wrap.style.zIndex = "10"
    wrap.style.transform = "translateY(-50%)"

    const isTemplate = Boolean(this.templateStatus)
    const actionNodes: React.ReactNode[] = []
    if (this.templateStatus) {
      actionNodes.push(
        createElement(TemplateStatusButton, {
          status: this.templateStatus.status,
          onToggle: () => this.templateStatus?.onToggle(this.templateStatus.line),
        }),
      )
    }
    if ((this.templateStatus || this.isSupple || this.isLog) && this.onCleanTemplate) {
      actionNodes.push(
        createElement(MarkdownActionCleanButton, {
          onClean: this.onCleanTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
        }),
      )
    }
    if ((this.templateStatus || this.isSupple || this.isLog) && this.onDeleteTemplate) {
      actionNodes.push(
        createElement(MarkdownActionDeleteButton, {
          onDelete: this.onDeleteTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
        }),
      )
    }
    actionNodes.push(
      createElement(MarkdownActionCopyButton, {
        text: this.codeText,
        label: this.copyTitle,
        isTemplate,
        isSupple: this.isSupple,
        isLog: this.isLog,
      }),
    )
    if (this.showFoldBtn) {
      actionNodes.push(
        createElement(MarkdownActionFoldButton, {
          isFolded: this.isFolded,
          label: this.foldTitle,
          unfoldLabel: this.unfoldTitle,
          isTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
          onToggle: this.onToggleFold,
        }),
      )
    }

    this.reactRoot = createRoot(wrap)
    this.reactRoot.render(createElement(Fragment, null, ...actionNodes))
    return wrap
  }

  destroy(_dom: HTMLElement): void {
    const root = this.reactRoot
    this.reactRoot = null
    // 推迟到微任务，避免在 React 渲染/提交期间同步 unmount 子 root 触发警告。
    if (root) queueMicrotask(() => root.unmount())
  }
}

/**
 * 为不同 Markdown 标记添加独立颜色，弥补语法标签共用造成的辨识度不足。
 */
export const markdownMarkerHighlight = (
  showFolding = false,
  getReferencedProjectNames?: () => Set<string>,
) => {
  const markerPlugin = ViewPlugin.fromClass(
    class {
      decorations: ReturnType<typeof buildMarkdownMarkerDecorations>
      foldedIndices = new Set<number>()
      templateFoldedIndices = new Set<number>()
      suppleFoldedIndices = new Set<number>()
      logFoldedIndices = new Set<number>()
      initialLogScanned = false
      wasComposing = false
      referencedNamesKey = ""

      constructor(view: EditorView) {
        this.scanInitialLogs(view)
        this.decorations = buildMarkdownMarkerDecorations(
          view,
          this.foldedIndices,
          (index) => this.toggleFold(view, index),
          this.templateFoldedIndices,
          (index) => this.toggleTemplateFold(view, index),
          (line) => this.cycleTemplateStatus(view, line),
          showFolding,
          getReferencedProjectNames,
          (startLine, endLine) => this.deleteTemplateBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanTemplateBlock(view, startLine, endLine),
          this.suppleFoldedIndices,
          (index) => this.toggleSuppleFold(view, index),
          (startLine, endLine) => this.deleteSuppleBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanSuppleBlock(view, startLine, endLine),
          this.logFoldedIndices,
          (index) => this.toggleLogFold(view, index),
          (startLine, endLine) => this.deleteLogBlock(view, startLine, endLine),
          (startLine, endLine) => this.cleanLogBlock(view, startLine, endLine),
        )
      }

      scanInitialLogs(view: EditorView) {
        if (this.initialLogScanned) return
        this.initialLogScanned = true
        let logIndex = 0
        for (const line of view.state.doc.iterLines()) {
          if (MARKDOWN_LOG_START_RE.test(line)) {
            // 刷新页面或重新进入默认为折叠
            this.logFoldedIndices.add(logIndex++)
          }
        }
      }

      update(update: ViewUpdate): void {
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes)
          this.wasComposing = true
          return
        }

        let namesChanged = false
        if (getReferencedProjectNames) {
          const currentKey = [...getReferencedProjectNames()].sort().join("\u0000")
          namesChanged = currentKey !== this.referencedNamesKey
          this.referencedNamesKey = currentKey
        }

        const isFoldToggled = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(markdownBlockFoldToggleEffect)),
        )
        if (
          !update.docChanged &&
          !update.selectionSet &&
          !isFoldToggled &&
          !this.wasComposing &&
          !namesChanged
        )
          return

        this.wasComposing = false
        this.decorations = buildMarkdownMarkerDecorations(
          update.view,
          this.foldedIndices,
          (index) => this.toggleFold(update.view, index),
          this.templateFoldedIndices,
          (index) => this.toggleTemplateFold(update.view, index),
          (line) => this.cycleTemplateStatus(update.view, line),
          showFolding,
          getReferencedProjectNames,
          (startLine, endLine) => this.deleteTemplateBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanTemplateBlock(update.view, startLine, endLine),
          this.suppleFoldedIndices,
          (index) => this.toggleSuppleFold(update.view, index),
          (startLine, endLine) => this.deleteSuppleBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanSuppleBlock(update.view, startLine, endLine),
          this.logFoldedIndices,
          (index) => this.toggleLogFold(update.view, index),
          (startLine, endLine) => this.deleteLogBlock(update.view, startLine, endLine),
          (startLine, endLine) => this.cleanLogBlock(update.view, startLine, endLine),
        )
      }

      toggleFold(view: EditorView, index: number) {
        if (this.foldedIndices.has(index)) {
          this.foldedIndices.delete(index)
        } else {
          this.foldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      toggleTemplateFold(view: EditorView, index: number) {
        if (this.templateFoldedIndices.has(index)) {
          this.templateFoldedIndices.delete(index)
        } else {
          this.templateFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      toggleSuppleFold(view: EditorView, index: number) {
        if (this.suppleFoldedIndices.has(index)) {
          this.suppleFoldedIndices.delete(index)
        } else {
          this.suppleFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      toggleLogFold(view: EditorView, index: number) {
        if (this.logFoldedIndices.has(index)) {
          this.logFoldedIndices.delete(index)
        } else {
          this.logFoldedIndices.add(index)
        }
        view.dispatch({ effects: markdownBlockFoldToggleEffect.of() })
      }

      cycleTemplateStatus(view: EditorView, line: number) {
        const docLine = view.state.doc.line(line + 1)
        const nextLineText = cycleMarkdownTemplateStatus(docLine.text)
        if (nextLineText === null) return

        view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
      }

      deleteTemplateBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        // 未闭合模板块（无结束行）视为延伸到文档末尾。
        const safeEndLine = endLine < startLine ? doc.lines - 1 : endLine
        const startDocLine = doc.line(startLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanTemplateBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines - 1 : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = stripEmptyTemplateItems(innerLines.join("\n"), true)
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }

      deleteSuppleBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines - 1 : endLine
        const startDocLine = doc.line(startLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanSuppleBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines - 1 : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = stripEmptyTemplateItems(innerLines.join("\n"), false)
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }

      deleteLogBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines - 1 : endLine
        const startDocLine = doc.line(startLine + 1)
        const endDocLine = doc.line(safeEndLine + 1)

        view.dispatch({
          changes: {
            from: startDocLine.from,
            to: Math.min(endDocLine.to + 1, doc.length),
          },
        })
      }

      cleanLogBlock(view: EditorView, startLine: number, endLine: number) {
        const doc = view.state.doc
        const safeEndLine = endLine < startLine ? doc.lines - 1 : endLine
        if (safeEndLine <= startLine + 1) return

        const innerLines: string[] = []
        for (let l = startLine + 1; l < safeEndLine; l++) {
          innerLines.push(doc.line(l + 1).text)
        }

        const cleaned = stripEmptyTemplateItems(innerLines.join("\n"), false)
        const firstInnerLine = doc.line(startLine + 2)
        const lastInnerLine = doc.line(safeEndLine)

        view.dispatch({
          changes: {
            from: firstInnerLine.from,
            to: lastInnerLine.to,
            insert: cleaned,
          },
        })
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

  return [markerPlugin]
}

/**
 * 扫描文档行并生成 Markdown 标记装饰。
 */
const buildMarkdownMarkerDecorations = (
  view: EditorView,
  foldedIndices = new Set<number>(),
  onToggleFold: (index: number) => void = () => {},
  templateFoldedIndices = new Set<number>(),
  onToggleTemplateFold: (index: number) => void = () => {},
  onCycleTemplateStatus: (line: number) => void = () => {},
  showFolding = false,
  getReferencedProjectNames?: () => Set<string>,
  onDeleteTemplateBlock: (startLine: number, endLine: number) => void = () => {},
  onCleanTemplateBlock: (startLine: number, endLine: number) => void = () => {},
  suppleFoldedIndices = new Set<number>(),
  onToggleSuppleFold: (index: number) => void = () => {},
  onDeleteSuppleBlock: (startLine: number, endLine: number) => void = () => {},
  onCleanSuppleBlock: (startLine: number, endLine: number) => void = () => {},
  logFoldedIndices = new Set<number>(),
  onToggleLogFold: (index: number) => void = () => {},
  onDeleteLogBlock: (startLine: number, endLine: number) => void = () => {},
  onCleanLogBlock: (startLine: number, endLine: number) => void = () => {},
) => {
  const builder = new RangeSetBuilder<Decoration>()
  const allDecos: (
    | { type: "line"; from: number; className: string }
    | { type: "mark"; from: number; to: number; className: string; atomic?: boolean }
    | { type: "widget"; from: number; to: number; widget: CodeBlockActionWidget }
  )[] = []
  let offset = 0
  let isInsideCodeFence = false
  let currentFenceFolded = false
  let currentFenceTextLines: string[] = []
  let codeBlockIndex = 0
  let isInsideTemplateBlock = false
  let currentTemplateFolded = false
  let currentTemplateStatus: MarkdownTemplateStatus = "todo"
  let templateBlockIndex = 0
  let currentTemplateTextLines: string[] = []
  let isInsideSuppleBlock = false
  let currentSuppleFolded = false
  let suppleBlockIndex = 0
  let currentSuppleTextLines: string[] = []
  let isInsideLogBlock = false
  let currentLogFolded = false
  let logBlockIndex = 0
  let currentLogTextLines: string[] = []

  const templateStatusLineClass = (status: MarkdownTemplateStatus): string =>
    status === "todo" ? "" : ` cm-md-template-line-${status.replace("_", "-")}`

  const lines = Array.from(view.state.doc.iterLines())
  const referencedRoots = new Set(getMarkdownReferenceProjectPaths(view.state.doc.toString()))
  const enabledRoots = getReferencedProjectNames?.()
  if (enabledRoots) {
    for (const root of enabledRoots) referencedRoots.add(root)
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const addMarkerAlways = (from: number, to: number, className: string, atomic = false): void => {
      allDecos.push({ type: "mark", from: offset + from, to: offset + to, className, atomic })
    }
    const addMarker = (from: number, to: number, className: string, atomic = false): void => {
      if (!currentFenceFolded) {
        addMarkerAlways(from, to, className, atomic)
      }
    }
    const addMatches = (pattern: RegExp, className: string): void => {
      for (const match of line.matchAll(pattern)) {
        if (match.index !== undefined) {
          addMarker(match.index, match.index + match[0].length, className)
        }
      }
    }
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/)

    if (fenceMatch) {
      addMarkerAlways(
        fenceMatch[1].length,
        fenceMatch[1].length + fenceMatch[2].length,
        "cm-md-code-fence-marker",
      )
      const isStart = !isInsideCodeFence

      if (isStart) {
        const currentBlockIdx = codeBlockIndex++
        currentFenceFolded = foldedIndices.has(currentBlockIdx)

        currentFenceTextLines = []
        for (let j = i + 1; j < lines.length; j++) {
          const subLine = lines[j]
          if (subLine.match(/^(\s*)(`{3,}|~{3,})/)) {
            break
          }
          currentFenceTextLines.push(subLine)
        }
        const collectedText = currentFenceTextLines.join("\n")

        const fenceMarkerEnd = fenceMatch[1].length + fenceMatch[2].length
        const remainingText = line.slice(fenceMarkerEnd)
        const langMatch = remainingText.match(/^(\s*)(\S+)/)
        if (langMatch) {
          addMarkerAlways(
            fenceMarkerEnd + langMatch[1].length,
            fenceMarkerEnd + langMatch[1].length + langMatch[2].length,
            "cm-md-code-fence-language",
          )
        }

        allDecos.push({
          type: "widget",
          from: offset + line.length,
          to: offset + line.length,
          widget: new CodeBlockActionWidget(
            collectedText,
            currentFenceFolded,
            () => onToggleFold(currentBlockIdx),
            showFolding,
          ),
        })

        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-code-fence-start-line",
        })
      } else {
        if (currentFenceFolded) {
          allDecos.push({
            type: "line",
            from: offset,
            className: "cm-md-code-fence-hidden-line",
          })
        } else {
          allDecos.push({
            type: "line",
            from: offset,
            className: "cm-md-code-fence-end-line",
          })
        }
        currentFenceFolded = false
      }

      isInsideCodeFence = !isInsideCodeFence
      offset += line.length + 1
      continue
    }

    if (isInsideCodeFence) {
      if (currentFenceFolded) {
        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-code-fence-hidden-line",
        })
      } else {
        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-code-fence-middle-line",
        })
      }
      offset += line.length + 1
      continue
    }

    const templateStartMatch = line.match(
      /^(\s*)&&&\s+(?!done\b|in_progress\b)([A-Za-z]\w*)(?:\s+「title:[^」\n]*」)?\s*$/,
    )
    const templateEndMatch = line.match(
      /^\s*&&&(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/,
    )
    if (templateStartMatch && !isInsideTemplateBlock) {
      const currentTemplateIndex = templateBlockIndex++
      currentTemplateFolded = templateFoldedIndices.has(currentTemplateIndex)
      currentTemplateTextLines = []
      let templateEndIndex = -1
      for (let j = i + 1; j < lines.length; j++) {
        const subLine = lines[j]
        if (
          subLine.match(
            /^\s*&&&(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/,
          )
        ) {
          templateEndIndex = j
          break
        }
        currentTemplateTextLines.push(subLine)
      }

      const markerStart = templateStartMatch[1].length
      const markerEnd = markerStart + 3
      const commandName = templateStartMatch[2]
      addMarkerAlways(markerStart, markerEnd, "cm-md-template-marker")
      const commandIndex = line.indexOf(commandName, markerEnd)
      if (commandIndex !== -1) {
        addMarkerAlways(
          commandIndex,
          commandIndex + commandName.length,
          `cm-md-template-command cm-md-template-command-${commandName}`,
        )
      } else {
        addMarkerAlways(
          markerEnd + 1,
          line.length,
          `cm-md-template-command cm-md-template-command-${commandName}`,
        )
      }
      const titleMatch = line.match(/「title:[^」\n]*」/)
      if (titleMatch?.index !== undefined) {
        addMarkerAlways(
          titleMatch.index,
          titleMatch.index + titleMatch[0].length,
          "cm-md-template-title",
        )
      }
      const templateEndText = templateEndIndex === -1 ? "" : lines[templateEndIndex]
      const templateEndStatus = getMarkdownTemplateStatus(templateEndText) ?? "todo"
      allDecos.push({
        type: "widget",
        from: offset + line.length,
        to: offset + line.length,
        widget: new CodeBlockActionWidget(
          stripEmptyTemplateItems(
            stripMarkdownTemplateComments(
              stripMarkdownSlashCommands(
                stripMarkdownSuppleBlocks(currentTemplateTextLines.join("\n")),
              ),
            ),
          ),
          currentTemplateFolded,
          () => onToggleTemplateFold(currentTemplateIndex),
          showFolding,
          "cm-template-block-action-wrap",
          undefined,
          undefined,
          undefined,
          {
            line: templateEndIndex,
            status: templateEndStatus,
            onToggle: onCycleTemplateStatus,
          },
          i,
          () => onDeleteTemplateBlock(i, templateEndIndex),
          () => onCleanTemplateBlock(i, templateEndIndex),
        ),
      })
      allDecos.push({
        type: "line",
        from: offset,
        className: `cm-md-template-start-line${templateStatusLineClass(templateEndStatus)}`,
      })
      currentTemplateStatus = templateEndStatus
      isInsideTemplateBlock = true
      offset += line.length + 1
      continue
    }

    if (templateEndMatch && isInsideTemplateBlock) {
      const markerStart = line.indexOf("&&&")
      addMarkerAlways(markerStart, markerStart + 3, "cm-md-template-marker")
      const statusMatch = line.match(
        /\s+(done|in_progress)(?=(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$)/,
      )
      if (statusMatch?.index !== undefined) {
        const statusStart = statusMatch.index + 1
        const statusClassName =
          statusMatch[1] === "done" ? "cm-md-template-done" : "cm-md-template-in-progress"
        // 状态标记仅覆盖状态词本身，避免与紧跟其后的 id 标记叠加背景。
        addMarkerAlways(statusStart, statusStart + statusMatch[1].length, statusClassName)
      }
      // id 为系统分配标识：着色展示并设为原子范围，光标导航跳过、源码受事务过滤器保护。
      const idMatch = line.match(/\{id:[0-9a-f]{32}\}/)
      if (idMatch?.index !== undefined) {
        addMarkerAlways(idMatch.index, idMatch.index + idMatch[0].length, "cm-md-template-id", true)
      }
      // wt 为工作区绑定：着色展示并设为原子范围，光标导航跳过、源码受事务过滤器保护。
      const wtMatch = line.match(/\{wt:[^}\s{]+\}/)
      if (wtMatch?.index !== undefined) {
        addMarkerAlways(wtMatch.index, wtMatch.index + wtMatch[0].length, "cm-md-template-wt", true)
      }
      allDecos.push({
        type: "line",
        from: offset,
        className: currentTemplateFolded
          ? "cm-md-template-hidden-line"
          : `cm-md-template-end-line${templateStatusLineClass((statusMatch?.[1] as MarkdownTemplateStatus | undefined) ?? "todo")}`,
      })
      isInsideTemplateBlock = false
      isInsideSuppleBlock = false
      currentTemplateFolded = false
      currentTemplateStatus = "todo"
      offset += line.length + 1
      continue
    }

    // supple 补充块：识别 +++ suppleTemplate / +++ supple 起止行，给予独立装饰。
    if (!currentTemplateFolded) {
      if (MARKDOWN_SUPPLE_START_RE.test(line)) {
        const currentSuppleIndex = suppleBlockIndex++
        currentSuppleFolded = suppleFoldedIndices.has(currentSuppleIndex)
        currentSuppleTextLines = []
        let suppleEndIndex = -1
        for (let j = i + 1; j < lines.length; j++) {
          const subLine = lines[j]
          if (MARKDOWN_SUPPLE_END_RE.test(subLine)) {
            suppleEndIndex = j
            break
          }
          currentSuppleTextLines.push(subLine)
        }

        const markerStart = line.indexOf("+++")
        addMarkerAlways(markerStart, markerStart + 3, "cm-md-supple-marker")
        const commandMatch = line.match(/\+\+\+\s+(suppleTemplate|supple)/)
        if (commandMatch && commandMatch.index !== undefined) {
          const commandStart = line.indexOf(commandMatch[1], markerStart + 3)
          if (commandStart !== -1) {
            addMarkerAlways(
              commandStart,
              commandStart + commandMatch[1].length,
              "cm-md-supple-command",
            )
          }
        }
        allDecos.push({
          type: "widget",
          from: offset + line.length,
          to: offset + line.length,
          widget: new CodeBlockActionWidget(
            stripEmptyTemplateItems(
              stripMarkdownTemplateComments(currentSuppleTextLines.join("\n")),
            ),
            currentSuppleFolded,
            () => onToggleSuppleFold(currentSuppleIndex),
            showFolding,
            "cm-supple-block-action-wrap",
            undefined,
            undefined,
            undefined,
            null,
            null,
            () => onDeleteSuppleBlock(i, suppleEndIndex),
            () => onCleanSuppleBlock(i, suppleEndIndex),
            true,
          ),
        })
        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-supple-start-line",
        })
        isInsideSuppleBlock = true
        offset += line.length + 1
        continue
      }

      if (isInsideSuppleBlock && MARKDOWN_SUPPLE_END_RE.test(line)) {
        const markerStart = line.indexOf("+++")
        addMarkerAlways(markerStart, markerStart + 3, "cm-md-supple-marker")
        allDecos.push({
          type: "line",
          from: offset,
          className: currentSuppleFolded ? "cm-md-supple-hidden-line" : "cm-md-supple-end-line",
        })
        isInsideSuppleBlock = false
        currentSuppleFolded = false
        offset += line.length + 1
        continue
      }

      if (isInsideSuppleBlock) {
        const isCommentLine = MARKDOWN_TEMPLATE_COMMENT_RE.test(line)
        allDecos.push({
          type: "line",
          from: offset,
          className: currentSuppleFolded
            ? "cm-md-supple-hidden-line"
            : isCommentLine
              ? "cm-md-template-comment-line"
              : "cm-md-supple-middle-line",
        })
      }

      // log 补充块：识别 +++ logTemplate / +++ log 起止行，给予独立装饰。
      if (MARKDOWN_LOG_START_RE.test(line)) {
        const currentLogIndex = logBlockIndex++
        currentLogFolded = logFoldedIndices.has(currentLogIndex)
        currentLogTextLines = []
        let logEndIndex = -1
        for (let j = i + 1; j < lines.length; j++) {
          const subLine = lines[j]
          if (MARKDOWN_LOG_END_RE.test(subLine)) {
            logEndIndex = j
            break
          }
          currentLogTextLines.push(subLine)
        }

        const markerStart = line.indexOf("+++")
        addMarkerAlways(markerStart, markerStart + 3, "cm-md-log-marker")
        const commandMatch = line.match(/\+\+\+\s+(logTemplate|log)/)
        if (commandMatch && commandMatch.index !== undefined) {
          const commandStart = line.indexOf(commandMatch[1], markerStart + 3)
          if (commandStart !== -1) {
            addMarkerAlways(commandStart, commandStart + commandMatch[1].length, "cm-md-log-command")
          }
        }
        allDecos.push({
          type: "widget",
          from: offset + line.length,
          to: offset + line.length,
          widget: new CodeBlockActionWidget(
            stripEmptyTemplateItems(stripMarkdownTemplateComments(currentLogTextLines.join("\n"))),
            currentLogFolded,
            () => onToggleLogFold(currentLogIndex),
            showFolding,
            "cm-supple-block-action-wrap",
            undefined,
            undefined,
            undefined,
            null,
            null,
            () => onDeleteLogBlock(i, logEndIndex),
            () => onCleanLogBlock(i, logEndIndex),
            false,
            true,
          ),
        })
        allDecos.push({
          type: "line",
          from: offset,
          className: "cm-md-log-start-line",
        })
        isInsideLogBlock = true
        offset += line.length + 1
        continue
      }

      if (isInsideLogBlock && MARKDOWN_LOG_END_RE.test(line)) {
        const markerStart = line.indexOf("+++")
        addMarkerAlways(markerStart, markerStart + 3, "cm-md-log-marker")
        allDecos.push({
          type: "line",
          from: offset,
          className: currentLogFolded ? "cm-md-log-hidden-line" : "cm-md-log-end-line",
        })
        isInsideLogBlock = false
        currentLogFolded = false
        offset += line.length + 1
        continue
      }

      if (isInsideLogBlock) {
        const isCommentLine = MARKDOWN_TEMPLATE_COMMENT_RE.test(line)
        allDecos.push({
          type: "line",
          from: offset,
          className: currentLogFolded
            ? "cm-md-log-hidden-line"
            : isCommentLine
              ? "cm-md-template-comment-line"
              : "cm-md-log-middle-line",
        })
      }
    }

    if (isInsideTemplateBlock && !isInsideSuppleBlock && !isInsideLogBlock) {
      const isCommentLine = MARKDOWN_TEMPLATE_COMMENT_RE.test(line)
      allDecos.push({
        type: "line",
        from: offset,
        className: currentTemplateFolded
          ? "cm-md-template-hidden-line"
          : `${isCommentLine ? "cm-md-template-comment-line" : "cm-md-template-middle-line"}${templateStatusLineClass(currentTemplateStatus)}`,
      })
    }

    const headingMatch = line.match(/^(\s*)(#{1,6})(?=\s)/)
    if (headingMatch) {
      addMarker(
        headingMatch[1].length,
        headingMatch[1].length + headingMatch[2].length,
        "cm-md-heading-marker",
      )
    }

    const taskMatch = line.match(/^(\s*)([-+*])\s+(\[[ xX]\])/)
    if (taskMatch) {
      addMarker(
        taskMatch[1].length,
        taskMatch[1].length + taskMatch[2].length,
        "cm-md-unordered-list-marker",
      )
      const taskStart = taskMatch[1].length + taskMatch[2].length + 1
      addMarker(taskStart, taskStart + taskMatch[3].length, "cm-md-task-marker")
    } else {
      const unorderedMatch = line.match(/^(\s*)([-+*])(?=\s)/)
      const orderedMatch = line.match(/^(\s*)(\d+[.)])(?=\s)/)
      if (unorderedMatch) {
        addMarker(
          unorderedMatch[1].length,
          unorderedMatch[1].length + unorderedMatch[2].length,
          "cm-md-unordered-list-marker",
        )
      } else if (orderedMatch) {
        addMarker(
          orderedMatch[1].length,
          orderedMatch[1].length + orderedMatch[2].length,
          "cm-md-ordered-list-marker",
        )
      }
    }

    const quoteMatch = line.match(/^(\s*)(>+)/)
    if (quoteMatch) {
      addMarker(
        quoteMatch[1].length,
        quoteMatch[1].length + quoteMatch[2].length,
        "cm-md-quote-marker",
      )
    }

    if (/^\s*\|.*\|\s*$/.test(line)) {
      addMatches(/(?<!\\)\|/g, "cm-md-table-marker")
    }

    if (/^\s*(?:[-*_])(?:\s*[-*_]){2,}\s*$/.test(line)) {
      addMatches(/[-*_]/g, "cm-md-separator-marker")
      offset += line.length + 1
      continue
    }

    addMatches(/(?<!\\)(?:\*\*|__)/g, "cm-md-strong-marker")
    addMatches(/(?<!\\)~~/g, "cm-md-strike-marker")
    addMatches(/(?<!\\)(?<!\*)(?:\*)(?!\*|\s)|(?<!\\)(?<!_)(?:_)(?!_|\s)/g, "cm-md-emphasis-marker")
    addMatches(/(?<!\\)`/g, "cm-md-inline-code-marker")
    addMatches(/(?<![\\]【)(?<=\【)[^【】\r\n]+(?=\】)/g, "cm-md-bracket-content-marker")
    if (!taskMatch) {
      addMatches(/(?<!\\)[\[\]\(\)]/g, "cm-md-link-marker")
    }
    for (const match of line.matchAll(MARKDOWN_REFERENCE_PATTERN)) {
      if (match.index === undefined) continue

      const type = getMarkdownReferenceType(match[1] ?? "")
      if (!type) continue

      addMarker(match.index, match.index + match[0].length, `cm-md-reference-${type}`)
    }
    for (const match of line.matchAll(MARKDOWN_FILE_MENTION_PATTERN)) {
      if (match.index === undefined) continue

      const fullMention = match[0]
      const isReferenced = isPathUnderReferencedRoots(fullMention, referencedRoots)
      const className = isReferenced ? "cm-md-referenced-file-mention" : "cm-md-file-mention"
      addMarker(match.index, match.index + fullMention.length, className)
    }

    offset += line.length + 1
  }

  allDecos.sort((first, second) => {
    if (first.from !== second.from) {
      return first.from - second.from
    }
    if (first.type === "line" && second.type !== "line") return -1
    if (first.type !== "line" && second.type === "line") return 1
    if (first.type === "widget" && second.type === "mark") return -1
    if (first.type === "mark" && second.type === "widget") return 1
    if (first.type === "mark" && second.type === "mark") {
      return first.to - second.to
    }
    return 0
  })
  for (const deco of allDecos) {
    if (deco.type === "line") {
      builder.add(deco.from, deco.from, Decoration.line({ attributes: { class: deco.className } }))
    } else if (deco.type === "widget") {
      builder.add(deco.from, deco.to, Decoration.widget({ widget: deco.widget, side: 1 }))
    } else {
      builder.add(
        deco.from,
        deco.to,
        deco.atomic
          ? Decoration.mark({ class: deco.className, atomic: true })
          : Decoration.mark({ class: deco.className }),
      )
    }
  }

  return builder.finish()
}

// 生成包含表头和内容行的 Markdown 表格。
export const createMarkdownTable = ({ columns, rows }: MarkdownTableSize): string => {
  const createRow = (firstCell = ""): string => `| ${firstCell} |${" |".repeat(columns - 1)}\n`
  return `${createRow("Header")}|${" --- |".repeat(columns)}\n${createRow("Content")}${createRow().repeat(rows - 1)}`
}

const markdownTableSeparatorCellPattern = /^:?-+:?$/

const splitMarkdownTableRow = (line: string): string[] | null => {
  const trimmedLine = line.trim()
  if (!trimmedLine.includes("|")) return null

  const content = trimmedLine.replace(/^\|/, "").replace(/\|$/, "")
  const cells = content.split("|").map((cell) => cell.trim())
  return cells.length > 1 ? cells : null
}

const getMarkdownTableAlignment = (cell: string): MarkdownTableAlignment => {
  const startsWithColon = cell.startsWith(":")
  const endsWithColon = cell.endsWith(":")
  if (startsWithColon && endsWithColon) return "center"
  if (endsWithColon) return "right"
  return "left"
}

const formatMarkdownTable = (lines: string[]): string[] => {
  const rows = lines.map(splitMarkdownTableRow)
  if (rows.some((row) => row === null)) return lines

  const tableRows = rows as string[][]
  const separatorIndex = tableRows.findIndex((row) =>
    row.every((cell) => markdownTableSeparatorCellPattern.test(cell)),
  )
  if (separatorIndex !== 1) return lines

  const columnCount = Math.max(...tableRows.map((row) => row.length))
  const normalizedRows = tableRows.map((row) =>
    Array.from({ length: columnCount }, (_, index) => row[index] ?? ""),
  )
  const alignments = normalizedRows[separatorIndex].map(getMarkdownTableAlignment)

  return normalizedRows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      if (rowIndex !== separatorIndex) return cell
      const alignment = alignments[columnIndex]
      if (alignment === "center") return ":-:"
      if (alignment === "right") return "--:"
      return "---"
    })
    return `| ${cells.join(" | ")} |`
  })
}

/**
 * 按常见 Markdown 约定整理文档格式，不修改代码围栏内部内容。
 */
export const formatMarkdown = (content: string): string => {
  if (content.trim().length === 0) return ""

  const sourceLines = content.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")
  const formattedLines: string[] = []
  let inCodeFence = false

  for (let index = 0; index < sourceLines.length; index += 1) {
    const sourceLine = sourceLines[index]
    const trimmedLine = sourceLine.trim()
    if (/^\s*(`{3,}|~{3,})/.test(sourceLine)) {
      inCodeFence = !inCodeFence
      formattedLines.push(inCodeFence ? sourceLine.trimEnd() : sourceLine.trim())
      continue
    }
    if (inCodeFence) {
      formattedLines.push(sourceLine)
      continue
    }

    const tableRows = [sourceLine]
    const nextLine = sourceLines[index + 1]
    if (nextLine && splitMarkdownTableRow(sourceLine) && splitMarkdownTableRow(nextLine)) {
      tableRows.push(nextLine)
      let tableIndex = index + 2
      while (tableIndex < sourceLines.length && splitMarkdownTableRow(sourceLines[tableIndex])) {
        tableRows.push(sourceLines[tableIndex])
        tableIndex += 1
      }
      const formattedTable = formatMarkdownTable(tableRows)
      const tableChanged =
        formattedTable.length !== tableRows.length ||
        formattedTable.some((line, lineIndex) => line !== tableRows[lineIndex])
      if (tableChanged) {
        formattedLines.push(...formattedTable)
        index = tableIndex - 1
        continue
      }
    }

    const normalizedLine =
      trimmedLine.length === 0
        ? ""
        : sourceLine
            .trimEnd()
            .replace(/^(\s*)[*+](\s+)/, "$1- ")
            .replace(/^(\s*)(\d+)[.)](\s+)/, "$1$2. ")
    formattedLines.push(normalizedLine)
  }

  return `${formattedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n`
}

const getMarkdownLineAtPosition = (
  content: string,
  position: number,
): { index: number; start: number; text: string } => {
  const lines = content.split("\n")
  let start = 0
  const boundedPosition = Math.min(Math.max(position, 0), content.length)

  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index]
    if (boundedPosition <= start + text.length || index === lines.length - 1) {
      return { index, start, text }
    }
    start += text.length + 1
  }

  return { index: 0, start: 0, text: lines[0] ?? "" }
}

const getMarkdownLineSignature = (text: string): string => text.replace(/\s/g, "")

const findMarkdownLineIndex = (lines: string[], sourceIndex: number, signature: string): number => {
  if (getMarkdownLineSignature(lines[sourceIndex] ?? "") === signature) return sourceIndex

  for (let distance = 1; distance < lines.length; distance += 1) {
    const nextIndex = sourceIndex + distance
    if (nextIndex < lines.length && getMarkdownLineSignature(lines[nextIndex]) === signature) {
      return nextIndex
    }
    const previousIndex = sourceIndex - distance
    if (previousIndex >= 0 && getMarkdownLineSignature(lines[previousIndex]) === signature) {
      return previousIndex
    }
  }

  return Math.min(sourceIndex, Math.max(lines.length - 1, 0))
}

const mapMarkdownColumn = (
  sourceLine: string,
  targetLine: string,
  sourceColumn: number,
): number => {
  const meaningfulCharacters = sourceLine.slice(0, sourceColumn).replace(/\s/g, "").length
  if (meaningfulCharacters === 0) return 0

  let meaningfulCount = 0
  for (let index = 0; index < targetLine.length; index += 1) {
    if (!/\s/.test(targetLine[index])) meaningfulCount += 1
    if (meaningfulCount >= meaningfulCharacters) return index + 1
  }

  return targetLine.length
}

/**
 * 根据原行内容将编辑器选区位置映射到格式化后的文档。
 */
export const mapMarkdownPosition = (
  sourceContent: string,
  formattedContent: string,
  position: number,
): number => {
  const sourceLine = getMarkdownLineAtPosition(sourceContent, position)
  const formattedLines = formattedContent.split("\n")
  const targetIndex = findMarkdownLineIndex(
    formattedLines,
    sourceLine.index,
    getMarkdownLineSignature(sourceLine.text),
  )
  let targetStart = 0
  for (let index = 0; index < targetIndex; index += 1) {
    targetStart += (formattedLines[index]?.length ?? 0) + 1
  }

  return (
    targetStart +
    mapMarkdownColumn(
      sourceLine.text,
      formattedLines[targetIndex] ?? "",
      position - sourceLine.start,
    )
  )
}

/**
 * 全选编辑器内容，并在选区渲染后恢复原有滚动位置。
 */
export const selectAllPreservingScrollPosition = (view: EditorView): boolean => {
  const { scrollLeft, scrollTop } = view.scrollDOM
  view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } })

  requestAnimationFrame(() => {
    view.scrollDOM.scrollTo({ left: scrollLeft, top: scrollTop })
  })

  return true
}

// Markdown 同步滚动锚点。
interface MarkdownScrollAnchor {
  line: number
  top: number
}

const getPreviewScrollAnchors = (preview: HTMLElement): MarkdownScrollAnchor[] =>
  Array.from(preview.querySelectorAll<HTMLElement>(".markdown-preview-content > [data-line]"))
    .map((element) => ({
      line: Number(element.dataset.line),
      top:
        element.getBoundingClientRect().top -
        preview.getBoundingClientRect().top +
        preview.scrollTop,
    }))
    .filter((anchor) => Number.isFinite(anchor.line))

const getAnchorIndex = (
  anchors: MarkdownScrollAnchor[],
  position: number,
  key: "line" | "top",
): number => {
  for (let index = anchors.length - 1; index >= 0; index -= 1) {
    if (anchors[index][key] <= position) return index
  }

  return -1
}

const getEditorLineTop = (view: EditorView, line: number): number =>
  line === 0 ? 0 : view.lineBlockAt(view.state.doc.line(line + 1).from).top

const synchronizeScrollPosition = (
  sourcePosition: number,
  sourceStart: number,
  sourceEnd: number,
  targetStart: number,
  targetEnd: number,
): number => {
  if (sourceEnd <= sourceStart || targetEnd <= targetStart) return targetStart

  const progress = Math.min(
    1,
    Math.max(0, (sourcePosition - sourceStart) / (sourceEnd - sourceStart)),
  )
  return targetStart + (targetEnd - targetStart) * progress
}

export const synchronizeEditorToPreview = (view: EditorView, preview: HTMLElement): void => {
  const editor = view.scrollDOM
  const anchors = getPreviewScrollAnchors(preview)
  if (anchors.length === 0) return

  const block = view.lineBlockAtHeight(editor.scrollTop)
  const line = view.state.doc.lineAt(block.from).number - 1
  const index = getAnchorIndex(anchors, line, "line")
  const anchor = anchors[index]
  const nextAnchor = anchors[index + 1]
  const sourceStart = anchor ? getEditorLineTop(view, anchor.line) : 0
  const sourceEnd = nextAnchor
    ? getEditorLineTop(view, nextAnchor.line)
    : editor.scrollHeight - editor.clientHeight
  const targetStart = anchor?.top ?? 0
  const targetEnd = nextAnchor ? nextAnchor.top : preview.scrollHeight - preview.clientHeight

  preview.scrollTop = synchronizeScrollPosition(
    editor.scrollTop,
    sourceStart,
    sourceEnd,
    targetStart,
    targetEnd,
  )
}

export const synchronizePreviewToEditor = (preview: HTMLElement, view: EditorView): void => {
  const editor = view.scrollDOM
  const anchors = getPreviewScrollAnchors(preview)
  if (anchors.length === 0) return

  const index = getAnchorIndex(anchors, preview.scrollTop, "top")
  const anchor = anchors[index]
  const nextAnchor = anchors[index + 1]
  const sourceStart = anchor?.top ?? 0
  const sourceEnd = nextAnchor ? nextAnchor.top : preview.scrollHeight - preview.clientHeight
  const targetStart = anchor ? getEditorLineTop(view, anchor.line) : 0
  const targetEnd = nextAnchor
    ? getEditorLineTop(view, nextAnchor.line)
    : editor.scrollHeight - editor.clientHeight

  editor.scrollTop = synchronizeScrollPosition(
    preview.scrollTop,
    sourceStart,
    sourceEnd,
    targetStart,
    targetEnd,
  )
}
