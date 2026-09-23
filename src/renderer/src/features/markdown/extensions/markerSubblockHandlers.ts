import {
  MARKDOWN_LOG_END_RE,
  MARKDOWN_LOG_MARKER_RE,
  MARKDOWN_SUPPLE_END_RE,
  MARKDOWN_TEMPLATE_COMMENT_RE,
  parseMarkdownLogEndLine,
  parseMarkdownLogStartLine,
  parseMarkdownSuppleEndLine,
  parseMarkdownSuppleStartLine,
} from "@/features/markdown/commands/markdownBlockCommands"
import type { MarkerBlockScanContext } from "@/features/markdown/extensions/markerTemplateHandlers"
import { CodeBlockActionWidget } from "@/features/markdown/extensions/markerWidgets"
import {
  extractParentTemplateCopyContent,
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"

// 处理临时块（+++ <名称> ... +++，仅限任务块内部）的标记与折叠交互。
export const handleSuppleBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  const suppleStart = parseMarkdownSuppleStartLine(ctx.line)
  if (
    suppleStart &&
    !ctx.isInsideSuppleBlock &&
    (ctx.isInsideTemplateBlock || ctx.allowStandaloneSubblocks)
  ) {
    const startLine = ctx.i
    const currentSuppleIndex = ctx.suppleBlockIndex++
    ctx.currentSuppleFolded = ctx.suppleFoldedIndices.has(currentSuppleIndex)
    const currentSuppleTextLines: string[] = []
    let suppleEndIndex = -1
    let suppleBlockId: string | null = null
    for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
      const subLine = ctx.lines[j]
      if (MARKDOWN_SUPPLE_END_RE.test(subLine)) {
        suppleEndIndex = j
        const idMatch = subLine.match(/\{id:([0-9a-f]{32})\}/)
        if (idMatch) suppleBlockId = idMatch[1]
        break
      }
      currentSuppleTextLines.push(subLine)
    }

    const markerStart = ctx.line.indexOf("+++")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-supple-marker")
    const commandStart = ctx.line.indexOf(suppleStart.command, markerStart + 3)
    if (commandStart !== -1) {
      ctx.addMarkerAlways(
        commandStart,
        commandStart + suppleStart.command.length,
        "cm-md-supple-command",
      )
      const flagStart = ctx.line.indexOf("--start", commandStart + suppleStart.command.length)
      if (flagStart !== -1) {
        ctx.addMarkerAlways(flagStart, flagStart + "--start".length, "cm-md-supple-flag")
      }
    }
    const titleMatch = ctx.line.match(/「title:[^」\n]*」/)
    if (titleMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        titleMatch.index,
        titleMatch.index + titleMatch[0].length,
        "cm-md-template-title",
      )
    }
    ctx.allDecos.push({
      type: "widget",
      from: ctx.offset + ctx.line.length,
      to: ctx.offset + ctx.line.length,
      widget: new CodeBlockActionWidget(
        stripEmptyTemplateItems(
          stripMarkdownTemplateComments(
            extractParentTemplateCopyContent(currentSuppleTextLines.join("\n")),
          ),
        ),
        ctx.currentSuppleFolded,
        () => ctx.onToggleSuppleFold(currentSuppleIndex),
        ctx.showFolding,
        "cm-supple-block-action-wrap",
        undefined,
        undefined,
        undefined,
        null,
        startLine,
        () => ctx.onDeleteSuppleBlock(startLine, suppleEndIndex),
        () => ctx.onCleanSuppleBlock(startLine, suppleEndIndex),
        true,
        false,
        suppleEndIndex,
        suppleBlockId,
      ),
    })
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: "cm-md-supple-start-line",
    })
    ctx.isInsideSuppleBlock = true
    return true
  }

  if (ctx.isInsideSuppleBlock && MARKDOWN_SUPPLE_END_RE.test(ctx.line)) {
    const markerStart = ctx.line.indexOf("+++")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-supple-marker")
    const suppleEnd = parseMarkdownSuppleEndLine(ctx.line)
    if (suppleEnd) {
      const commandStart = ctx.line.indexOf(suppleEnd.command, markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + suppleEnd.command.length,
          "cm-md-supple-command",
        )
      }
    }
    const flagMatch = ctx.line.match(/--end/)
    if (flagMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        flagMatch.index,
        flagMatch.index + flagMatch[0].length,
        "cm-md-supple-flag",
      )
    }
    const idMatch = ctx.line.match(/\{id:[0-9a-f]{32}\}/)
    if (idMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        idMatch.index,
        idMatch.index + idMatch[0].length,
        "cm-md-template-id",
        true,
      )
    }
    const wtMatch = ctx.line.match(/\{wt:[^}\s{]+\}/)
    if (wtMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        wtMatch.index,
        wtMatch.index + wtMatch[0].length,
        "cm-md-template-wt",
        true,
      )
    }
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: ctx.currentSuppleFolded ? "cm-md-supple-hidden-line" : "cm-md-supple-end-line",
    })
    ctx.isInsideSuppleBlock = false
    ctx.currentSuppleFolded = false
    return true
  }

  if (ctx.isInsideSuppleBlock) {
    const isCommentLine = MARKDOWN_TEMPLATE_COMMENT_RE.test(ctx.line)
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: ctx.currentSuppleFolded
        ? "cm-md-supple-hidden-line"
        : isCommentLine
          ? "cm-md-template-comment-line"
          : "cm-md-supple-middle-line",
    })
  }

  return false
}

// 处理记录块（%%% <名称> ... %%%；兼容旧版 +++ log/logTemplate；仅限任务块内部）的标记与折叠交互。
export const handleLogBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  const logStart = parseMarkdownLogStartLine(ctx.line)
  if (logStart && (ctx.isInsideTemplateBlock || ctx.allowStandaloneSubblocks)) {
    const startLine = ctx.i
    const currentLogIndex = ctx.logBlockIndex++
    ctx.currentLogFolded = ctx.logFoldedIndices.has(currentLogIndex)
    const currentLogTextLines: string[] = []
    let logEndIndex = -1
    let logBlockId: string | null = null
    for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
      const subLine = ctx.lines[j]
      if (MARKDOWN_LOG_END_RE.test(subLine)) {
        logEndIndex = j
        const idMatch = subLine.match(/\{id:([0-9a-f]{32})\}/)
        if (idMatch) logBlockId = idMatch[1]
        break
      }
      currentLogTextLines.push(subLine)
    }

    const markerStart = ctx.line.search(MARKDOWN_LOG_MARKER_RE)
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-log-marker")
    const commandStart = ctx.line.indexOf(logStart.command, markerStart + 3)
    if (commandStart !== -1) {
      ctx.addMarkerAlways(commandStart, commandStart + logStart.command.length, "cm-md-log-command")
      const flagStart = ctx.line.indexOf("--start", commandStart + logStart.command.length)
      if (flagStart !== -1) {
        ctx.addMarkerAlways(flagStart, flagStart + "--start".length, "cm-md-log-flag")
      }
    }
    const titleMatch = ctx.line.match(/「title:[^」\n]*」/)
    if (titleMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        titleMatch.index,
        titleMatch.index + titleMatch[0].length,
        "cm-md-template-title",
      )
    }
    ctx.allDecos.push({
      type: "widget",
      from: ctx.offset + ctx.line.length,
      to: ctx.offset + ctx.line.length,
      widget: new CodeBlockActionWidget(
        stripEmptyTemplateItems(stripMarkdownTemplateComments(currentLogTextLines.join("\n"))),
        ctx.currentLogFolded,
        () => ctx.onToggleLogFold(currentLogIndex),
        ctx.showFolding,
        "cm-supple-block-action-wrap",
        undefined,
        undefined,
        undefined,
        null,
        startLine,
        () => ctx.onDeleteLogBlock(startLine, logEndIndex),
        () => ctx.onCleanLogBlock(startLine, logEndIndex),
        false,
        true,
        logEndIndex,
        logBlockId,
      ),
    })
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: "cm-md-log-start-line",
    })
    ctx.isInsideLogBlock = true
    return true
  }

  if (ctx.isInsideLogBlock && MARKDOWN_LOG_END_RE.test(ctx.line)) {
    const markerStart = ctx.line.search(MARKDOWN_LOG_MARKER_RE)
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-log-marker")
    const logEnd = parseMarkdownLogEndLine(ctx.line)
    if (logEnd) {
      const commandStart = ctx.line.indexOf(logEnd.command, markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(commandStart, commandStart + logEnd.command.length, "cm-md-log-command")
      }
    }
    const flagMatch = ctx.line.match(/--end/)
    if (flagMatch?.index !== undefined) {
      ctx.addMarkerAlways(flagMatch.index, flagMatch.index + flagMatch[0].length, "cm-md-log-flag")
    }
    const idMatch = ctx.line.match(/\{id:[0-9a-f]{32}\}/)
    if (idMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        idMatch.index,
        idMatch.index + idMatch[0].length,
        "cm-md-template-id",
        true,
      )
    }
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: ctx.currentLogFolded ? "cm-md-log-hidden-line" : "cm-md-log-end-line",
    })
    ctx.isInsideLogBlock = false
    ctx.currentLogFolded = false
    return true
  }

  if (ctx.isInsideLogBlock) {
    const isCommentLine = MARKDOWN_TEMPLATE_COMMENT_RE.test(ctx.line)
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: ctx.currentLogFolded
        ? "cm-md-log-hidden-line"
        : isCommentLine
          ? "cm-md-template-comment-line"
          : "cm-md-log-middle-line",
    })
  }

  return false
}
