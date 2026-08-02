import { HighlightStyle } from "@codemirror/language"
import { RangeSetBuilder, StateEffect } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { toggleMarkdownTemplateDone } from "@/components/ui/LxMarkdown/commands/markdownBlockCommands"
import {
  getMarkdownReferenceLabel,
  getMarkdownReferenceName,
  getMarkdownReferenceProjectPaths,
  getMarkdownReferenceType,
  type MarkdownReferenceType,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import {
  mountFileMentionWidget,
  mountMarkdownReferenceWidget,
} from "@/components/ui/LxMarkdown/components/EditorMentionWidgets"
import {
  getFileMentionDisplayLabel,
  MARKDOWN_FILE_MENTION_PATTERN,
} from "@/components/ui/LxMarkdown/extensions/markdownFileMentions"
import type { MarkdownTableSize } from "@/components/ui/LxMarkdown/types"

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
      padding: "12px 16px 35vh",
      caretColor: "#ffffff",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: "1.65",
    },
    ".cm-line": {
      // 内容行高
      lineHeight: "1.85",
    },
    ".cm-scroller": {
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
    ".cm-md-template-done, .cm-md-template-done *": {
      color: "#34d399 !important",
      backgroundColor: "rgba(52, 211, 153, 0.15) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-code-fence-language, .cm-md-code-fence-language *": {
      color: "#38bdf8 !important",
      fontWeight: "700",
      backgroundColor: "rgba(56, 189, 248, 0.12) !important",
      padding: "1px 6px !important",
      borderRadius: "3px !important",
    },
    ".cm-md-code-fence-start-line": {
      borderTop: "1px solid rgba(255, 255, 255, 0.08)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-code-fence-middle-line": {
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
    },
    ".cm-md-code-fence-end-line": {
      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
      borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
      borderRight: "1px solid rgba(255, 255, 255, 0.08)",
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      backgroundColor: "rgba(255, 255, 255, 0.015)",
      paddingLeft: "6px",
      paddingBottom: "4px",
    },
    ".cm-md-template-start-line": {
      borderTop: "1px solid rgba(129, 140, 248, 0.2)",
      borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
      borderRight: "1px solid rgba(129, 140, 248, 0.2)",
      borderBottom: "1px solid rgba(129, 140, 248, 0.2)",
      borderTopLeftRadius: "6px",
      borderTopRightRadius: "6px",
      backgroundColor: "rgba(129, 140, 248, 0.03)",
      paddingLeft: "6px",
      paddingTop: "4px",
      paddingBottom: "4px",
    },
    ".cm-md-template-middle-line": {
      borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
      borderRight: "1px solid rgba(129, 140, 248, 0.2)",
      backgroundColor: "rgba(129, 140, 248, 0.03)",
      paddingLeft: "6px",
    },
    ".cm-md-template-end-line": {
      borderBottom: "1px solid rgba(129, 140, 248, 0.2)",
      borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
      borderRight: "1px solid rgba(129, 140, 248, 0.2)",
      borderBottomLeftRadius: "6px",
      borderBottomRightRadius: "6px",
      backgroundColor: "rgba(129, 140, 248, 0.03)",
      paddingLeft: "6px",
      paddingBottom: "4px",
    },
    ".cm-md-template-hidden-line": {
      display: "none !important",
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
      backgroundColor: "rgba(196, 181, 253, 0.12) !important",
      borderRadius: "3px !important",
    },
    ".cm-md-reference-folder, .cm-md-reference-folder *": {
      color: "#d97706 !important",
      backgroundColor: "rgba(217, 119, 6, 0.12) !important",
      borderRadius: "3px !important",
    },
    ".cm-md-reference-file, .cm-md-reference-file *": {
      color: "#7dd3fc !important",
      backgroundColor: "rgba(125, 211, 252, 0.12) !important",
      borderRadius: "3px !important",
    },
    ".cm-md-reference-image, .cm-md-reference-image *": {
      color: "#f9a8d4 !important",
      backgroundColor: "rgba(249, 168, 212, 0.12) !important",
      borderRadius: "3px !important",
    },
    ".cm-md-reference-common, .cm-md-reference-common *": {
      color: "#cbd5e1 !important",
      backgroundColor: "rgba(203, 213, 225, 0.12) !important",
      borderRadius: "3px !important",
    },
    ".cm-md-code-fence-hidden-line": {
      display: "none !important",
    },
    ".cm-md-code-fence-start-line .cm-monospace, .cm-md-code-fence-middle-line .cm-monospace, .cm-md-code-fence-end-line .cm-monospace, .cm-md-template-start-line .cm-monospace, .cm-md-template-middle-line .cm-monospace, .cm-md-template-end-line .cm-monospace":
      {
        color: "inherit !important",
        backgroundColor: "transparent !important",
        padding: "0 !important",
        borderRadius: "0 !important",
      },
    ".cm-md-code-fence-start-line span:not(.cm-md-code-fence-language):not(.markdown-reference):not(.markdown-reference *):not(.markdown-file-mention-node), .cm-md-code-fence-middle-line span:not(.markdown-reference):not(.markdown-reference *):not(.markdown-file-mention-node), .cm-md-code-fence-end-line span:not(.markdown-reference):not(.markdown-reference *):not(.markdown-file-mention-node), .cm-md-template-start-line span:not(.cm-md-template-command):not(.cm-md-template-done):not(.markdown-reference):not(.markdown-reference *):not(.markdown-file-mention-node), .cm-md-template-middle-line span:not(.markdown-reference):not(.markdown-reference *):not(.markdown-file-mention-node), .cm-md-template-end-line span:not(.markdown-reference):not(.markdown-reference *):not(.markdown-file-mention-node)":
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

export class FileMentionWidget extends WidgetType {
  private mount: { container: HTMLElement; destroy: () => void } | null = null

  constructor(
    readonly fullMention: string,
    readonly displayLabel: string,
    readonly isReferenced: boolean,
  ) {
    super()
  }

  eq(other: FileMentionWidget) {
    return (
      this.fullMention === other.fullMention &&
      this.displayLabel === other.displayLabel &&
      this.isReferenced === other.isReferenced
    )
  }

  toDOM() {
    this.mount?.destroy()
    this.mount = mountFileMentionWidget(this.displayLabel, this.fullMention, this.isReferenced)
    return this.mount.container
  }

  destroy() {
    this.mount?.destroy()
    this.mount = null
  }

  ignoreEvent() {
    return false
  }
}

export class MarkdownReferenceWidget extends WidgetType {
  private mount: { container: HTMLElement; destroy: () => void } | null = null

  constructor(
    readonly path: string,
    readonly type: MarkdownReferenceType,
    readonly label: string,
    readonly name: string,
  ) {
    super()
  }

  eq(other: MarkdownReferenceWidget) {
    return (
      this.path === other.path &&
      this.type === other.type &&
      this.label === other.label &&
      this.name === other.name
    )
  }

  toDOM() {
    this.mount?.destroy()
    this.mount = mountMarkdownReferenceWidget(this.path, this.type, this.label, this.name)
    return this.mount.container
  }

  destroy() {
    this.mount?.destroy()
    this.mount = null
  }

  ignoreEvent() {
    return false
  }
}

// 模板块状态切换配置。
interface TemplateStatusAction {
  line: number
  done: boolean
  onToggle: (line: number, done: boolean) => void
}

class CodeBlockActionWidget extends WidgetType {
  constructor(
    readonly codeText: string,
    readonly isFolded: boolean,
    readonly onToggleFold: () => void,
    readonly showFoldBtn = true,
    readonly actionClassName = "cm-code-block-action-wrap",
    readonly copyTitle = "复制代码",
    readonly foldTitle = "折叠代码块",
    readonly unfoldTitle = "展开代码块",
    readonly templateStatus: TemplateStatusAction | null = null,
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
      this.templateStatus?.done === other.templateStatus?.done
    )
  }

  toDOM() {
    const wrap = document.createElement("span")
    wrap.className = this.actionClassName
    wrap.style.position = "absolute"
    wrap.style.right = "24px"
    wrap.style.display = "inline-flex"
    wrap.style.alignItems = "center"
    wrap.style.gap = "6px"
    wrap.style.background = "transparent"
    wrap.style.border = "none"
    wrap.style.borderRadius = "4px"
    wrap.style.padding = "2px 4px"
    wrap.style.zIndex = "10"
    wrap.style.transform = "translateY(-4px)"

    // 状态按钮（仅模板块）
    const statusBtn = document.createElement("button")
    statusBtn.type = "button"
    statusBtn.className = `${this.actionClassName}-btn`
    statusBtn.style.border = "none"
    statusBtn.style.background = "transparent"
    statusBtn.style.cursor = "pointer"
    statusBtn.style.display = "flex"
    statusBtn.style.padding = "2px"
    statusBtn.style.color = this.templateStatus?.done ? "#34d399" : "rgba(255, 255, 255, 0.5)"
    statusBtn.style.transition = "color 0.2s"
    statusBtn.title = this.templateStatus?.done ? "标记为未完成" : "标记为已完成"
    statusBtn.onmouseenter = () => {
      statusBtn.style.color = this.templateStatus?.done ? "#34d399" : "#ffffff"
    }
    statusBtn.onmouseleave = () => {
      statusBtn.style.color = this.templateStatus?.done ? "#34d399" : "rgba(255, 255, 255, 0.5)"
    }

    statusBtn.innerHTML = this.templateStatus?.done
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-check"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle"><circle cx="12" cy="12" r="10"/></svg>`

    statusBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (this.templateStatus) {
        this.templateStatus.onToggle(this.templateStatus.line, !this.templateStatus.done)
      }
    }

    // 复制按钮
    const copyBtn = document.createElement("button")
    copyBtn.type = "button"
    copyBtn.className = `${this.actionClassName}-btn`
    copyBtn.style.border = "none"
    copyBtn.style.background = "transparent"
    copyBtn.style.cursor = "pointer"
    copyBtn.style.display = "flex"
    copyBtn.style.padding = "2px"
    copyBtn.style.color = "rgba(255, 255, 255, 0.5)"
    copyBtn.style.transition = "color 0.2s"
    copyBtn.title = this.copyTitle
    let isCopied = false
    copyBtn.onmouseenter = () => {
      copyBtn.style.color = isCopied ? "#34d399" : "#ffffff"
    }
    copyBtn.onmouseleave = () => {
      copyBtn.style.color = isCopied ? "#34d399" : "rgba(255, 255, 255, 0.5)"
    }

    // 复制图标 SVG
    copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`

    copyBtn.onclick = async (e) => {
      e.preventDefault()
      e.stopPropagation()
      try {
        await navigator.clipboard.writeText(this.codeText)
        isCopied = true
        copyBtn.style.color = "#34d399"
        copyBtn.title = "已复制"
        copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check"><path d="M20 6 9 17l-5-5"/></svg>`
        setTimeout(() => {
          isCopied = false
          copyBtn.style.color = "rgba(255, 255, 255, 0.5)"
          copyBtn.title = this.copyTitle
          copyBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-copy"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`
        }, 1500)
      } catch (err) {
        console.error("Failed to copy text: ", err)
      }
    }

    // 折叠按钮
    const foldBtn = document.createElement("button")
    foldBtn.type = "button"
    foldBtn.className = `${this.actionClassName}-btn`
    foldBtn.style.border = "none"
    foldBtn.style.background = "transparent"
    foldBtn.style.cursor = "pointer"
    foldBtn.style.display = "flex"
    foldBtn.style.padding = "2px"
    foldBtn.style.color = "rgba(255, 255, 255, 0.5)"
    foldBtn.style.transition = "color 0.2s"
    foldBtn.title = this.isFolded ? this.unfoldTitle : this.foldTitle
    foldBtn.onmouseenter = () => {
      foldBtn.style.color = "#ffffff"
    }
    foldBtn.onmouseleave = () => {
      foldBtn.style.color = "rgba(255, 255, 255, 0.5)"
    }

    if (this.isFolded) {
      foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-down"><path d="m6 9 6 6 6-6"/></svg>`
    } else {
      foldBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-chevron-up"><path d="m18 15-6-6-6 6"/></svg>`
    }

    foldBtn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.onToggleFold()
    }

    if (this.templateStatus) {
      wrap.appendChild(statusBtn)
    }
    wrap.appendChild(copyBtn)
    if (this.showFoldBtn) {
      wrap.appendChild(foldBtn)
    }

    return wrap
  }
}

/**
 * 为不同 Markdown 标记添加独立颜色，弥补语法标签共用造成的辨识度不足。
 */
export const markdownMarkerHighlight = (showFolding = false) => [
  ViewPlugin.fromClass(
    class {
      decorations: ReturnType<typeof buildMarkdownMarkerDecorations>
      foldedIndices = new Set<number>()
      templateFoldedIndices = new Set<number>()
      wasComposing = false

      constructor(view: EditorView) {
        this.decorations = buildMarkdownMarkerDecorations(
          view,
          this.foldedIndices,
          (index) => this.toggleFold(view, index),
          this.templateFoldedIndices,
          (index) => this.toggleTemplateFold(view, index),
          (line, done) => this.toggleTemplateStatus(view, line, done),
          showFolding,
        )
      }

      update(update: ViewUpdate): void {
        if (update.view.composing) {
          if (update.docChanged) this.decorations = this.decorations.map(update.changes)
          this.wasComposing = true
          return
        }

        const isFoldToggled = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(markdownBlockFoldToggleEffect)),
        )
        if (!update.docChanged && !update.selectionSet && !isFoldToggled && !this.wasComposing)
          return

        this.wasComposing = false
        this.decorations = buildMarkdownMarkerDecorations(
          update.view,
          this.foldedIndices,
          (index) => this.toggleFold(update.view, index),
          this.templateFoldedIndices,
          (index) => this.toggleTemplateFold(update.view, index),
          (line, done) => this.toggleTemplateStatus(update.view, line, done),
          showFolding,
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

      toggleTemplateStatus(view: EditorView, line: number, done: boolean) {
        const docLine = view.state.doc.line(line + 1)
        const nextLineText = toggleMarkdownTemplateDone(docLine.text, done)
        if (nextLineText === null) return

        view.dispatch({ changes: { from: docLine.from, to: docLine.to, insert: nextLineText } })
      }
    },
    { decorations: (plugin) => plugin.decorations },
  ),
]

/**
 * 扫描文档行并生成 Markdown 标记装饰。
 */
const buildMarkdownMarkerDecorations = (
  view: EditorView,
  foldedIndices = new Set<number>(),
  onToggleFold: (index: number) => void = () => {},
  templateFoldedIndices = new Set<number>(),
  onToggleTemplateFold: (index: number) => void = () => {},
  onToggleTemplateStatus: (line: number, done: boolean) => void = () => {},
  showFolding = false,
) => {
  const builder = new RangeSetBuilder<Decoration>()
  const allDecos: (
    | { type: "line"; from: number; className: string }
    | { type: "mark"; from: number; to: number; className: string }
    | { type: "widget"; from: number; to: number; widget: CodeBlockActionWidget }
    | {
        type: "replace"
        from: number
        to: number
        widget: FileMentionWidget | MarkdownReferenceWidget
      }
  )[] = []
  let offset = 0
  let isInsideCodeFence = false
  let currentFenceFolded = false
  let currentFenceTextLines: string[] = []
  let codeBlockIndex = 0
  let isInsideTemplateBlock = false
  let currentTemplateFolded = false
  let templateBlockIndex = 0
  let currentTemplateTextLines: string[] = []

  const lines = Array.from(view.state.doc.iterLines())
  const referencedProjectNames = new Set(
    getMarkdownReferenceProjectPaths(view.state.doc.toString()).map(getMarkdownReferenceName),
  )

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const addMarkerAlways = (from: number, to: number, className: string): void => {
      allDecos.push({ type: "mark", from: offset + from, to: offset + to, className })
    }
    const addMarker = (from: number, to: number, className: string): void => {
      if (!currentFenceFolded) {
        addMarkerAlways(from, to, className)
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

    const templateStartMatch = line.match(/^(\s*)&&&\s+([A-Za-z]\w*)(?:\s+done)?\s*$/)
    const templateEndMatch = line.match(/^\s*&&&\s*$/)
    if (templateStartMatch && !isInsideTemplateBlock) {
      const currentTemplateIndex = templateBlockIndex++
      currentTemplateFolded = templateFoldedIndices.has(currentTemplateIndex)
      currentTemplateTextLines = []
      for (let j = i + 1; j < lines.length; j++) {
        const subLine = lines[j]
        if (subLine.match(/^\s*&&&\s*$/)) break
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
      const doneMatch = line.match(/\s+done\s*$/)
      if (doneMatch?.index !== undefined) {
        const doneStart = doneMatch.index + 1
        addMarkerAlways(doneStart, doneStart + 4, "cm-md-template-done")
      }
      allDecos.push({
        type: "widget",
        from: offset + line.length,
        to: offset + line.length,
        widget: new CodeBlockActionWidget(
          currentTemplateTextLines.join("\n"),
          currentTemplateFolded,
          () => onToggleTemplateFold(currentTemplateIndex),
          showFolding,
          "cm-template-block-action-wrap",
          "复制模板内容",
          "折叠模板块",
          "展开模板块",
          { line: i, done: /\s+done\s*$/.test(line), onToggle: onToggleTemplateStatus },
        ),
      })
      allDecos.push({
        type: "line",
        from: offset,
        className: "cm-md-template-start-line",
      })
      isInsideTemplateBlock = true
      offset += line.length + 1
      continue
    }

    if (templateEndMatch && isInsideTemplateBlock) {
      const markerStart = line.indexOf("&&&")
      addMarkerAlways(markerStart, markerStart + 3, "cm-md-template-marker")
      allDecos.push({
        type: "line",
        from: offset,
        className: currentTemplateFolded ? "cm-md-template-hidden-line" : "cm-md-template-end-line",
      })
      isInsideTemplateBlock = false
      currentTemplateFolded = false
      offset += line.length + 1
      continue
    }

    if (isInsideTemplateBlock) {
      allDecos.push({
        type: "line",
        from: offset,
        className: currentTemplateFolded
          ? "cm-md-template-hidden-line"
          : "cm-md-template-middle-line",
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
    if (!taskMatch) {
      addMatches(/(?<!\\)[\[\]\(\)]/g, "cm-md-link-marker")
    }
    const isComposing = view.composing
    const mainSelection = view.state.selection.main
    for (const match of line.matchAll(/@\[(refer-[a-z]+)\]\(((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g)) {
      if (match.index === undefined) continue

      const rawMatch = match[0]
      const typeStr = match[1] ?? ""
      const path = match[2] ?? ""
      const type = getMarkdownReferenceType(typeStr)
      if (!type) continue

      const label = getMarkdownReferenceLabel(type)
      const name = getMarkdownReferenceName(path)
      const from = offset + match.index
      const to = from + rawMatch.length

      const isCursorInside = mainSelection.from <= to && mainSelection.to >= from

      if (isCursorInside || isComposing) {
        const className = `cm-md-reference-${type}`
        addMarker(match.index, match.index + rawMatch.length, className)
      } else {
        allDecos.push({
          type: "replace",
          from,
          to,
          widget: new MarkdownReferenceWidget(path, type, label, name),
        })
      }
    }
    for (const match of line.matchAll(MARKDOWN_FILE_MENTION_PATTERN)) {
      if (match.index === undefined) continue

      const fullMention = match[0]
      const from = offset + match.index
      const to = from + fullMention.length

      const projectName = match[1]?.split("/")[0]
      const isReferenced = Boolean(projectName && referencedProjectNames.has(projectName))
      const displayLabel = getFileMentionDisplayLabel(fullMention, referencedProjectNames)

      const isCursorInside = mainSelection.from <= to && mainSelection.to >= from

      if (isCursorInside || isComposing) {
        const className = isReferenced ? "cm-md-referenced-file-mention" : "cm-md-file-mention"
        addMarker(match.index, match.index + fullMention.length, className)
      } else {
        allDecos.push({
          type: "replace",
          from,
          to,
          widget: new FileMentionWidget(fullMention, displayLabel, isReferenced),
        })
      }
    }

    offset += line.length + 1
  }

  allDecos.sort((first, second) => {
    if (first.from !== second.from) {
      return first.from - second.from
    }
    if (first.type === "line" && second.type !== "line") return -1
    if (first.type !== "line" && second.type === "line") return 1
    if (first.type === "replace" && second.type !== "replace") return -1
    if (first.type !== "replace" && second.type === "replace") return 1
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
    } else if (deco.type === "replace") {
      builder.add(deco.from, deco.to, Decoration.replace({ widget: deco.widget }))
    } else if (deco.type === "widget") {
      builder.add(deco.from, deco.to, Decoration.widget({ widget: deco.widget, side: 1 }))
    } else {
      builder.add(deco.from, deco.to, Decoration.mark({ class: deco.className }))
    }
  }

  return builder.finish()
}

// 生成包含表头和内容行的 Markdown 表格。
export const createMarkdownTable = ({ columns, rows }: MarkdownTableSize): string => {
  const createRow = (firstCell = ""): string => `| ${firstCell} |${"  |".repeat(columns - 1)}\n`
  return `${createRow("Header")}|${" --- |".repeat(columns)}\n${createRow("Content")}${createRow().repeat(rows - 1)}`
}

const markdownTableSeparatorCellPattern = /^:?-{3,}:?$/

const getMarkdownDisplayWidth = (text: string): number => {
  let width = 0
  for (const character of text) {
    width +=
      /[\u1100-\u115f\u2329\u232a\u2e80-\u303e\u3040-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/.test(
        character,
      )
        ? 2
        : 1
  }
  return width
}

const splitMarkdownTableRow = (line: string): string[] | null => {
  const trimmedLine = line.trim()
  if (!trimmedLine.includes("|")) return null

  const content = trimmedLine.replace(/^\|/, "").replace(/\|$/, "")
  const cells = content.split("|").map((cell) => cell.trim())
  return cells.length > 1 ? cells : null
}

const getMarkdownTableAlignment = (cell: string): "left" | "center" | "right" => {
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
  const widths = Array.from({ length: columnCount }, (_, columnIndex) =>
    Math.max(
      3,
      ...normalizedRows
        .filter((_, rowIndex) => rowIndex !== separatorIndex)
        .map((row) => getMarkdownDisplayWidth(row[columnIndex])),
    ),
  )

  const formatCell = (cell: string, columnIndex: number): string => {
    const width = widths[columnIndex]
    const padding = width - getMarkdownDisplayWidth(cell)
    if (alignments[columnIndex] === "right") return `${" ".repeat(padding)}${cell}`
    if (alignments[columnIndex] === "center") {
      const leftPadding = Math.floor(padding / 2)
      return `${" ".repeat(leftPadding)}${cell}${" ".repeat(padding - leftPadding)}`
    }
    return `${cell}${" ".repeat(padding)}`
  }

  return normalizedRows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      if (rowIndex !== separatorIndex) return formatCell(cell, columnIndex)
      const width = widths[columnIndex]
      const alignment = alignments[columnIndex]
      if (alignment === "center") return `:${"-".repeat(Math.max(1, width - 2))}:`
      if (alignment === "right") return `${"-".repeat(Math.max(2, width - 1))}:`
      return "-".repeat(width)
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
