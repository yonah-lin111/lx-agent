import { RangeSetBuilder } from "@codemirror/state"
import { Decoration, type EditorView } from "@codemirror/view"
import { MARKDOWN_TEMPLATE_COMMENT_RE } from "@/features/markdown/commands/markdownBlockCommands"
import {
  getMarkdownReferenceProjectPaths,
  getMarkdownReferenceType,
} from "@/features/markdown/commands/markdownReferenceCommands"
import { MARKDOWN_REFERENCE_PATTERN } from "@/features/markdown/extensions/editorHighlight"
import {
  isPathUnderReferencedRoots,
  MARKDOWN_FILE_MENTION_PATTERN,
} from "@/features/markdown/extensions/markdownFileMentions"
import {
  handleLogBlockLine,
  handleSuppleBlockLine,
} from "@/features/markdown/extensions/markerSubblockHandlers"
import {
  handleCodeFenceLine,
  handleTemplateBlockLine,
  handleVarTemplateBlockLine,
  type MarkerBlockScanContext,
  templateStatusLineClass,
} from "@/features/markdown/extensions/markerTemplateHandlers"
import type { MarkerDecoItem } from "@/features/markdown/extensions/markerWidgets"

/**
 * 扫描文档行并生成 Markdown 标记装饰。
 */
export const buildMarkdownMarkerDecorations = (
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
  varFoldedIndices = new Set<number>(),
  onToggleVarFold: (index: number) => void = () => {},
  onDeleteVarBlock: (startLine: number, endLine: number) => void = () => {},
  onCleanVarBlock: (startLine: number, endLine: number) => void = () => {},
  onMergeVarBlock: (startLine: number, endLine: number) => void = () => {},
  onMoveVarBlockToTop: (startLine: number, endLine: number) => void = () => {},
) => {
  const builder = new RangeSetBuilder<Decoration>()
  const allDecos: MarkerDecoItem[] = []
  let offset = 0

  const lines = Array.from(view.state.doc.iterLines())
  const referencedRoots = new Set(getMarkdownReferenceProjectPaths(view.state.doc.toString()))
  const enabledRoots = getReferencedProjectNames?.()
  if (enabledRoots) {
    for (const root of enabledRoots) referencedRoots.add(root)
  }

  const ctx: MarkerBlockScanContext = {
    allDecos,
    lines,
    i: 0,
    line: "",
    offset: 0,
    showFolding,
    addMarkerAlways: (from, to, className, atomic = false) => {
      allDecos.push({ type: "mark", from: offset + from, to: offset + to, className, atomic })
    },
    isInsideCodeFence: false,
    currentFenceFolded: false,
    codeBlockIndex: 0,
    foldedIndices,
    onToggleFold,

    isInsideTemplateBlock: false,
    currentTemplateFolded: false,
    currentTemplateStatus: "todo",
    templateBlockIndex: 0,
    templateFoldedIndices,
    onToggleTemplateFold,
    onCycleTemplateStatus,
    onDeleteTemplateBlock,
    onCleanTemplateBlock,

    isInsideSuppleBlock: false,
    currentSuppleFolded: false,
    suppleBlockIndex: 0,
    suppleFoldedIndices,
    onToggleSuppleFold,
    onDeleteSuppleBlock,
    onCleanSuppleBlock,

    isInsideLogBlock: false,
    currentLogFolded: false,
    logBlockIndex: 0,
    logFoldedIndices,
    onToggleLogFold,
    onDeleteLogBlock,
    onCleanLogBlock,

    isInsideVarBlock: false,
    isInsideVarTripleQuotes: false,
    currentVarFolded: false,
    varBlockIndex: 0,
    varFoldedIndices,
    onToggleVarFold,
    onDeleteVarBlock,
    onCleanVarBlock,
    onMergeVarBlock,
    onMoveVarBlockToTop,
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    ctx.i = i
    ctx.line = line
    ctx.offset = offset

    const addMarkerAlways = (from: number, to: number, className: string, atomic = false): void => {
      allDecos.push({ type: "mark", from: offset + from, to: offset + to, className, atomic })
    }
    const addMarker = (from: number, to: number, className: string, atomic = false): void => {
      if (!ctx.currentFenceFolded) {
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

    if (handleCodeFenceLine(ctx)) {
      offset += line.length + 1
      continue
    }

    if (handleVarTemplateBlockLine(ctx)) {
      offset += line.length + 1
      continue
    }

    if (handleTemplateBlockLine(ctx)) {
      offset += line.length + 1
      continue
    }

    if (!ctx.currentTemplateFolded) {
      if (handleSuppleBlockLine(ctx)) {
        offset += line.length + 1
        continue
      }

      if (handleLogBlockLine(ctx)) {
        offset += line.length + 1
        continue
      }
    }

    if (ctx.isInsideTemplateBlock && !ctx.isInsideSuppleBlock && !ctx.isInsideLogBlock) {
      const isCommentLine = MARKDOWN_TEMPLATE_COMMENT_RE.test(line)
      allDecos.push({
        type: "line",
        from: offset,
        className: ctx.currentTemplateFolded
          ? "cm-md-template-hidden-line"
          : `${isCommentLine ? "cm-md-template-comment-line" : "cm-md-template-middle-line"}${templateStatusLineClass(ctx.currentTemplateStatus)}`,
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
