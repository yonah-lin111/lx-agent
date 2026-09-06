import {
  getMarkdownTemplateStatus,
  type MarkdownTemplateStatus,
} from "@/features/markdown/commands/markdownBlockCommands"
import { stripMarkdownSlashCommands } from "@/features/markdown/commands/markdownSlashCommands"
import {
  CodeBlockActionWidget,
  type MarkerDecoItem,
} from "@/features/markdown/extensions/markerWidgets"
import {
  extractParentTemplateCopyContent,
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"

// Markdown 块扫描解析上下文契约。
export interface MarkerBlockScanContext {
  allDecos: MarkerDecoItem[]
  lines: string[]
  i: number
  line: string
  offset: number
  showFolding: boolean
  addMarkerAlways: (from: number, to: number, className: string, atomic?: boolean) => void

  isInsideCodeFence: boolean
  currentFenceFolded: boolean
  codeBlockIndex: number
  foldedIndices: Set<number>
  onToggleFold: (index: number) => void

  isInsideTemplateBlock: boolean
  currentTemplateFolded: boolean
  currentTemplateStatus: MarkdownTemplateStatus
  templateBlockIndex: number
  templateFoldedIndices: Set<number>
  onToggleTemplateFold: (index: number) => void
  onCycleTemplateStatus: (line: number) => void
  onDeleteTemplateBlock: (startLine: number, endLine: number) => void
  onCleanTemplateBlock: (startLine: number, endLine: number) => void

  isInsideSuppleBlock: boolean
  currentSuppleFolded: boolean
  suppleBlockIndex: number
  suppleFoldedIndices: Set<number>
  onToggleSuppleFold: (index: number) => void
  onDeleteSuppleBlock: (startLine: number, endLine: number) => void
  onCleanSuppleBlock: (startLine: number, endLine: number) => void

  isInsideLogBlock: boolean
  currentLogFolded: boolean
  logBlockIndex: number
  logFoldedIndices: Set<number>
  onToggleLogFold: (index: number) => void
  onDeleteLogBlock: (startLine: number, endLine: number) => void
  onCleanLogBlock: (startLine: number, endLine: number) => void
}

// 模板块状态对应的 CSS 类后缀。
export const templateStatusLineClass = (status: MarkdownTemplateStatus): string =>
  status === "todo" ? "" : ` cm-md-template-line-${status.replace("_", "-")}`

// 处理代码围栏块（``` 或 ~~~）的标记与折叠交互。
export const handleCodeFenceLine = (ctx: MarkerBlockScanContext): boolean => {
  const fenceMatch = ctx.line.match(/^(\s*)(`{3,}|~{3,})/)
  if (fenceMatch) {
    ctx.addMarkerAlways(
      fenceMatch[1].length,
      fenceMatch[1].length + fenceMatch[2].length,
      "cm-md-code-fence-marker",
    )
    const isStart = !ctx.isInsideCodeFence

    if (isStart) {
      const currentBlockIdx = ctx.codeBlockIndex++
      ctx.currentFenceFolded = ctx.foldedIndices.has(currentBlockIdx)

      const currentFenceTextLines: string[] = []
      for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
        const subLine = ctx.lines[j]
        if (subLine.match(/^(\s*)(`{3,}|~{3,})/)) {
          break
        }
        currentFenceTextLines.push(subLine)
      }
      const collectedText = currentFenceTextLines.join("\n")

      const fenceMarkerEnd = fenceMatch[1].length + fenceMatch[2].length
      const remainingText = ctx.line.slice(fenceMarkerEnd)
      const langMatch = remainingText.match(/^(\s*)(\S+)/)
      if (langMatch) {
        ctx.addMarkerAlways(
          fenceMarkerEnd + langMatch[1].length,
          fenceMarkerEnd + langMatch[1].length + langMatch[2].length,
          "cm-md-code-fence-language",
        )
      }

      ctx.allDecos.push({
        type: "widget",
        from: ctx.offset + ctx.line.length,
        to: ctx.offset + ctx.line.length,
        widget: new CodeBlockActionWidget(
          collectedText,
          ctx.currentFenceFolded,
          () => ctx.onToggleFold(currentBlockIdx),
          ctx.showFolding,
        ),
      })

      ctx.allDecos.push({
        type: "line",
        from: ctx.offset,
        className: "cm-md-code-fence-start-line",
      })
    } else {
      if (ctx.currentFenceFolded) {
        ctx.allDecos.push({
          type: "line",
          from: ctx.offset,
          className: "cm-md-code-fence-hidden-line",
        })
      } else {
        ctx.allDecos.push({
          type: "line",
          from: ctx.offset,
          className: "cm-md-code-fence-end-line",
        })
      }
      ctx.currentFenceFolded = false
    }

    ctx.isInsideCodeFence = !ctx.isInsideCodeFence
    return true
  }

  if (ctx.isInsideCodeFence) {
    if (ctx.currentFenceFolded) {
      ctx.allDecos.push({
        type: "line",
        from: ctx.offset,
        className: "cm-md-code-fence-hidden-line",
      })
    } else {
      ctx.allDecos.push({
        type: "line",
        from: ctx.offset,
        className: "cm-md-code-fence-middle-line",
      })
    }
    return true
  }

  return false
}

// 处理模板块（&&& ... &&&）的起止标记、状态切换与操作按钮。
export const handleTemplateBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  const templateStartMatch = ctx.line.match(
    /^(\s*)&&&\s+(?!done\b|in_progress\b)([A-Za-z]\w*)(?:\s+(--start))?(?:\s+「title:[^」\n]*」)?\s*$/,
  )
  const templateEndMatch = ctx.line.match(
    /^\s*&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/,
  )
  if (templateStartMatch && !ctx.isInsideTemplateBlock) {
    const startLine = ctx.i
    const currentTemplateIndex = ctx.templateBlockIndex++
    ctx.currentTemplateFolded = ctx.templateFoldedIndices.has(currentTemplateIndex)
    const currentTemplateTextLines: string[] = []
    let templateEndIndex = -1
    for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
      const subLine = ctx.lines[j]
      if (
        subLine.match(
          /^\s*&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/,
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
    ctx.addMarkerAlways(markerStart, markerEnd, "cm-md-template-marker")
    const commandIndex = ctx.line.indexOf(commandName, markerEnd)
    if (commandIndex !== -1) {
      ctx.addMarkerAlways(
        commandIndex,
        commandIndex + commandName.length,
        `cm-md-template-command cm-md-template-command-${commandName}`,
      )
    } else {
      ctx.addMarkerAlways(
        markerEnd + 1,
        ctx.line.length,
        `cm-md-template-command cm-md-template-command-${commandName}`,
      )
    }
    if (templateStartMatch[3]) {
      const flagIndex = ctx.line.indexOf(templateStartMatch[3], commandIndex + commandName.length)
      if (flagIndex !== -1) {
        ctx.addMarkerAlways(
          flagIndex,
          flagIndex + templateStartMatch[3].length,
          "cm-md-template-flag",
        )
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
    const templateEndText = templateEndIndex === -1 ? "" : ctx.lines[templateEndIndex]
    const templateEndStatus = getMarkdownTemplateStatus(templateEndText) ?? "todo"
    ctx.allDecos.push({
      type: "widget",
      from: ctx.offset + ctx.line.length,
      to: ctx.offset + ctx.line.length,
      widget: new CodeBlockActionWidget(
        stripEmptyTemplateItems(
          stripMarkdownTemplateComments(
            stripMarkdownSlashCommands(
              extractParentTemplateCopyContent(currentTemplateTextLines.join("\n")),
            ),
          ),
        ),
        ctx.currentTemplateFolded,
        () => ctx.onToggleTemplateFold(currentTemplateIndex),
        ctx.showFolding,
        "cm-template-block-action-wrap",
        undefined,
        undefined,
        undefined,
        {
          line: templateEndIndex,
          status: templateEndStatus,
          onToggle: ctx.onCycleTemplateStatus,
        },
        startLine,
        () => ctx.onDeleteTemplateBlock(startLine, templateEndIndex),
        () => ctx.onCleanTemplateBlock(startLine, templateEndIndex),
      ),
    })
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: `cm-md-template-start-line${templateStatusLineClass(templateEndStatus)}`,
    })
    ctx.currentTemplateStatus = templateEndStatus
    ctx.isInsideTemplateBlock = true
    return true
  }

  if (templateEndMatch && ctx.isInsideTemplateBlock) {
    const markerStart = ctx.line.indexOf("&&&")
    ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-template-marker")
    const endCommandMatch = ctx.line.match(/^(\s*)&&&\s+([A-Za-z]\w*)/)
    if (endCommandMatch) {
      const endCmdName = endCommandMatch[2]
      const endCmdIndex = ctx.line.indexOf(endCmdName, markerStart + 3)
      if (endCmdIndex !== -1) {
        ctx.addMarkerAlways(
          endCmdIndex,
          endCmdIndex + endCmdName.length,
          `cm-md-template-command cm-md-template-command-${endCmdName}`,
        )
      }
    }
    const endFlagMatch = ctx.line.match(/--end/)
    if (endFlagMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        endFlagMatch.index,
        endFlagMatch.index + endFlagMatch[0].length,
        "cm-md-template-flag",
      )
    }
    const statusMatch = ctx.line.match(
      /\s+(done|in_progress)(?=(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$)/,
    )
    if (statusMatch?.index !== undefined) {
      const statusStart = statusMatch.index + 1
      const statusClassName =
        statusMatch[1] === "done" ? "cm-md-template-done" : "cm-md-template-in-progress"
      ctx.addMarkerAlways(statusStart, statusStart + statusMatch[1].length, statusClassName)
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
      className: ctx.currentTemplateFolded
        ? "cm-md-template-hidden-line"
        : `cm-md-template-end-line${templateStatusLineClass((statusMatch?.[1] as MarkdownTemplateStatus | undefined) ?? "todo")}`,
    })
    ctx.isInsideTemplateBlock = false
    ctx.isInsideSuppleBlock = false
    ctx.currentTemplateFolded = false
    ctx.currentTemplateStatus = "todo"
    return true
  }

  return false
}
