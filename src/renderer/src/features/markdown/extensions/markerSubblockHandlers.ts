import {
  MARKDOWN_LOG_END_RE,
  MARKDOWN_LOG_START_RE,
  MARKDOWN_PRESET_END_RE,
  MARKDOWN_PRESET_START_RE,
  MARKDOWN_SUPPLE_END_RE,
  MARKDOWN_SUPPLE_START_RE,
  MARKDOWN_TEMPLATE_COMMENT_RE,
} from "@/features/markdown/commands/markdownBlockCommands"
import type { MarkerBlockScanContext } from "@/features/markdown/extensions/markerTemplateHandlers"
import { CodeBlockActionWidget } from "@/features/markdown/extensions/markerWidgets"
import {
  extractParentTemplateCopyContent,
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"

// 处理补充说明块（+++ supple ... +++）的标记与折叠交互。
export const handleSuppleBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  const suppleStartMatch = MARKDOWN_SUPPLE_START_RE.exec(ctx.line)
  if (suppleStartMatch && !ctx.isInsideSuppleBlock) {
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
    const commandMatch = ctx.line.match(/\+\+\+\s+(suppleTemplate|supple)\s+(--start)/)
    if (commandMatch && commandMatch.index !== undefined) {
      const commandStart = ctx.line.indexOf(commandMatch[1], markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + commandMatch[1].length,
          "cm-md-supple-command",
        )
        const flagStart = ctx.line.indexOf(commandMatch[2], commandStart + commandMatch[1].length)
        if (flagStart !== -1) {
          ctx.addMarkerAlways(flagStart, flagStart + commandMatch[2].length, "cm-md-supple-flag")
        }
      }
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
    const endCommandMatch = ctx.line.match(/\+\+\+\s+(suppleTemplate|supple)\s+(--end)/)
    if (endCommandMatch && endCommandMatch.index !== undefined) {
      const commandStart = ctx.line.indexOf(endCommandMatch[1], markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + endCommandMatch[1].length,
          "cm-md-supple-command",
        )
        const flagStart = ctx.line.indexOf(
          endCommandMatch[2],
          commandStart + endCommandMatch[1].length,
        )
        if (flagStart !== -1) {
          ctx.addMarkerAlways(flagStart, flagStart + endCommandMatch[2].length, "cm-md-supple-flag")
        }
      }
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

// 处理日志块（+++ log ... +++）的标记与折叠交互。
export const handleLogBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  if (MARKDOWN_LOG_START_RE.test(ctx.line)) {
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

    const markerStart = ctx.line.indexOf("+++")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-log-marker")
    const commandMatch = ctx.line.match(/\+\+\+\s+(logTemplate|log)\s+(--start)/)
    if (commandMatch && commandMatch.index !== undefined) {
      const commandStart = ctx.line.indexOf(commandMatch[1], markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + commandMatch[1].length,
          "cm-md-log-command",
        )
        const flagStart = ctx.line.indexOf(commandMatch[2], commandStart + commandMatch[1].length)
        if (flagStart !== -1) {
          ctx.addMarkerAlways(flagStart, flagStart + commandMatch[2].length, "cm-md-log-flag")
        }
      }
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
    const markerStart = ctx.line.indexOf("+++")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-log-marker")
    const endCommandMatch = ctx.line.match(/\+\+\+\s+(logTemplate|log)\s+(--end)/)
    if (endCommandMatch && endCommandMatch.index !== undefined) {
      const commandStart = ctx.line.indexOf(endCommandMatch[1], markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + endCommandMatch[1].length,
          "cm-md-log-command",
        )
        const flagStart = ctx.line.indexOf(
          endCommandMatch[2],
          commandStart + endCommandMatch[1].length,
        )
        if (flagStart !== -1) {
          ctx.addMarkerAlways(flagStart, flagStart + endCommandMatch[2].length, "cm-md-log-flag")
        }
      }
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

// 处理预设模板块（+++ presetTemplate ... +++）的标记与折叠交互。
export const handlePresetBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  const presetStartMatch = MARKDOWN_PRESET_START_RE.exec(ctx.line)
  if (presetStartMatch && !ctx.isInsidePresetBlock) {
    const startLine = ctx.i
    const currentPresetIndex = ctx.presetBlockIndex++
    ctx.currentPresetFolded = ctx.presetFoldedIndices.has(currentPresetIndex)
    let presetEndIndex = -1
    for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
      const subLine = ctx.lines[j]
      if (MARKDOWN_PRESET_END_RE.test(subLine)) {
        presetEndIndex = j
        break
      }
      if (/^\s*\$\$\$(?:\s+varTemplate\s+--end|\s+--end)?\s*$/.test(subLine)) {
        break
      }
    }

    const markerStart = ctx.line.indexOf("+++")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-preset-marker")
    const commandMatch = ctx.line.match(/\+\+\+\s+(presetTemplate|preset)\b/)
    if (commandMatch && commandMatch.index !== undefined) {
      const commandStart = ctx.line.indexOf(commandMatch[1], markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + commandMatch[1].length,
          "cm-md-preset-command",
        )
      }
    }
    const flagMatch = ctx.line.match(/--start/)
    if (flagMatch && flagMatch.index !== undefined) {
      ctx.addMarkerAlways(
        flagMatch.index,
        flagMatch.index + flagMatch[0].length,
        "cm-md-preset-flag",
      )
    }
    const titleMatch = ctx.line.match(/「title:[^」\n]*」/)
    if (titleMatch && titleMatch.index !== undefined) {
      ctx.addMarkerAlways(
        titleMatch.index,
        titleMatch.index + titleMatch[0].length,
        "cm-md-preset-title",
      )
    }

    ctx.allDecos.push({
      type: "widget",
      from: ctx.offset + ctx.line.length,
      to: ctx.offset + ctx.line.length,
      widget: new CodeBlockActionWidget(
        "",
        ctx.currentPresetFolded,
        () => ctx.onTogglePresetFold(currentPresetIndex),
        ctx.showFolding,
        "cm-preset-block-action-wrap",
        undefined,
        undefined,
        undefined,
        null,
        startLine,
        () => ctx.onDeletePresetBlock(startLine, presetEndIndex),
        null,
        false,
        false,
        presetEndIndex,
        null,
        false,
        null,
        null,
        true,
      ),
    })

    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: "cm-md-preset-start-line",
    })
    ctx.isInsidePresetBlock = true
    return true
  }

  if (ctx.isInsidePresetBlock && MARKDOWN_PRESET_END_RE.test(ctx.line)) {
    const markerStart = ctx.line.indexOf("+++")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-preset-marker")
    const commandMatch = ctx.line.match(/\+\+\+\s+(presetTemplate|preset)\b/)
    if (commandMatch && commandMatch.index !== undefined) {
      const commandStart = ctx.line.indexOf(commandMatch[1], markerStart + 3)
      if (commandStart !== -1) {
        ctx.addMarkerAlways(
          commandStart,
          commandStart + commandMatch[1].length,
          "cm-md-preset-command",
        )
      }
    }
    const flagMatch = ctx.line.match(/--end/)
    if (flagMatch && flagMatch.index !== undefined) {
      ctx.addMarkerAlways(
        flagMatch.index,
        flagMatch.index + flagMatch[0].length,
        "cm-md-preset-flag",
      )
    }

    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: ctx.currentPresetFolded ? "cm-md-preset-hidden-line" : "cm-md-preset-end-line",
    })
    ctx.isInsidePresetBlock = false
    ctx.currentPresetFolded = false
    return true
  }

  if (ctx.isInsidePresetBlock) {
    if (ctx.currentPresetFolded) {
      ctx.allDecos.push({
        type: "line",
        from: ctx.offset,
        className: "cm-md-preset-hidden-line",
      })
      return true
    }
  }

  return false
}
