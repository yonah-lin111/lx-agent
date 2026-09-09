import {
  getMarkdownTemplateStatus,
  type MarkdownTemplateStatus,
} from "@/features/markdown/commands/markdownBlockCommands"
import { stripMarkdownSlashCommands } from "@/features/markdown/commands/markdownSlashCommands"
import { MARKDOWN_VAR_TEMPLATE_END_RE } from "@/features/markdown/commands/markdownVariableCommands"
import {
  CodeBlockActionWidget,
  type MarkerDecoItem,
} from "@/features/markdown/extensions/markerWidgets"
import {
  extractParentTemplateCopyContent,
  stripEmptyTemplateItems,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"
import { handlePresetBlockLine } from "./markerSubblockHandlers"

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

  isInsideVarBlock: boolean
  isInsideVarTripleQuotes?: boolean
  currentVarFolded: boolean
  varBlockIndex: number
  varFoldedIndices: Set<number>
  onToggleVarFold: (index: number) => void
  onDeleteVarBlock: (startLine: number, endLine: number) => void
  onCleanVarBlock: (startLine: number, endLine: number) => void
  onMergeVarBlock: (startLine: number, endLine: number) => void
  onMoveVarBlockToTop?: (startLine: number, endLine: number) => void

  isInsidePresetBlock: boolean
  currentPresetFolded: boolean
  presetBlockIndex: number
  presetFoldedIndices: Set<number>
  onTogglePresetFold: (index: number) => void
  onDeletePresetBlock: (startLine: number, endLine: number) => void

  scanMarkdownTokens?: (
    line: string,
    addMarker: (from: number, to: number, className: string, atomic?: boolean) => void,
    addMatches: (pattern: RegExp, className: string) => void,
  ) => void
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
    let templateBlockId: string | null = null
    for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
      const subLine = ctx.lines[j]
      if (
        subLine.match(
          /^\s*&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/,
        )
      ) {
        templateEndIndex = j
        const idMatch = subLine.match(/\{id:([0-9a-f]{32})\}/)
        if (idMatch) templateBlockId = idMatch[1]
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
        false,
        false,
        templateEndIndex,
        templateBlockId,
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

// 处理变量模板块（$$$ varTemplate ... $$$ varTemplate --end）的起止标记与操作按钮。
export const handleVarTemplateBlockLine = (ctx: MarkerBlockScanContext): boolean => {
  const varStartMatch = ctx.line.match(
    /^(\s*)\$\$\$\s*(?:(varTemplate)(?:\s+(--start))?(?:\s+「title:[^」\n]*」)?)?\s*$/,
  )
  const varEndMatch = ctx.line.match(/^\s*\$\$\$(?:\s+(?:varTemplate)\s+--end|\s+--end)?\s*$/)

  if (varStartMatch && !ctx.isInsideVarBlock) {
    const startLine = ctx.i
    const currentVarIndex = ctx.varBlockIndex++
    ctx.currentVarFolded = ctx.varFoldedIndices.has(currentVarIndex)
    let varEndIndex = -1

    for (let j = ctx.i + 1; j < ctx.lines.length; j++) {
      if (MARKDOWN_VAR_TEMPLATE_END_RE.test(ctx.lines[j])) {
        varEndIndex = j
        break
      }
    }

    const markerStart = ctx.line.indexOf("$$$")
    if (markerStart !== -1) {
      ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-var-template-marker")
    }

    if (varStartMatch[2]) {
      const commandIndex = ctx.line.indexOf(
        varStartMatch[2],
        (markerStart === -1 ? 0 : markerStart) + 3,
      )
      if (commandIndex !== -1) {
        ctx.addMarkerAlways(
          commandIndex,
          commandIndex + varStartMatch[2].length,
          "cm-md-var-template-command",
        )
      }
    }

    if (varStartMatch[3]) {
      const flagIndex = ctx.line.indexOf(
        varStartMatch[3],
        (markerStart === -1 ? 0 : markerStart) + 3,
      )
      if (flagIndex !== -1) {
        ctx.addMarkerAlways(
          flagIndex,
          flagIndex + varStartMatch[3].length,
          "cm-md-var-template-flag",
        )
      }
    }

    const titleMatch = ctx.line.match(/「title:[^」\n]*」/)
    if (titleMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        titleMatch.index,
        titleMatch.index + titleMatch[0].length,
        "cm-md-var-template-title",
      )
    }

    ctx.allDecos.push({
      type: "widget",
      from: ctx.offset + ctx.line.length,
      to: ctx.offset + ctx.line.length,
      widget: new CodeBlockActionWidget(
        "",
        ctx.currentVarFolded,
        () => ctx.onToggleVarFold(currentVarIndex),
        ctx.showFolding,
        "cm-var-template-block-action-wrap",
        undefined,
        undefined,
        undefined,
        null,
        startLine,
        () => ctx.onDeleteVarBlock(startLine, varEndIndex),
        () => ctx.onCleanVarBlock(startLine, varEndIndex),
        false,
        false,
        varEndIndex,
        null,
        true,
        () => ctx.onMergeVarBlock(startLine, varEndIndex),
        ctx.onMoveVarBlockToTop ? () => ctx.onMoveVarBlockToTop!(startLine, varEndIndex) : null,
      ),
    })

    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: "cm-md-var-template-start-line",
    })

    ctx.isInsideVarBlock = true
    ctx.isInsideVarTripleQuotes = false
    return true
  }

  if (varEndMatch && ctx.isInsideVarBlock) {
    const markerStart = ctx.line.indexOf("$$$")
    if (markerStart !== -1) {
      ctx.addMarkerAlways(markerStart, markerStart + 3, "cm-md-var-template-marker")
    }
    const endCommandMatch = ctx.line.match(/varTemplate/)
    if (endCommandMatch?.index !== undefined) {
      ctx.addMarkerAlways(
        endCommandMatch.index,
        endCommandMatch.index + 11,
        "cm-md-var-template-command",
      )
    }
    const endFlagMatch = ctx.line.match(/--end/)
    if (endFlagMatch?.index !== undefined) {
      ctx.addMarkerAlways(endFlagMatch.index, endFlagMatch.index + 5, "cm-md-var-template-flag")
    }

    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: ctx.currentVarFolded
        ? "cm-md-var-template-hidden-line"
        : "cm-md-var-template-end-line",
    })

    ctx.isInsideVarBlock = false
    ctx.isInsideVarTripleQuotes = false
    ctx.currentVarFolded = false
    ctx.isInsidePresetBlock = false
    ctx.currentPresetFolded = false
    return true
  }

  if (ctx.isInsideVarBlock) {
    if (ctx.currentVarFolded) {
      ctx.allDecos.push({
        type: "line",
        from: ctx.offset,
        className: "cm-md-var-template-hidden-line",
      })
      return true
    }

    if (handlePresetBlockLine(ctx)) {
      return true
    }

    let isInvalid = false

    if (ctx.isInsideVarTripleQuotes) {
      const tripleIndex = ctx.line.indexOf('"""')
      if (tripleIndex !== -1) {
        if (tripleIndex > 0) {
          if (ctx.scanMarkdownTokens) {
            const textBefore = ctx.line.slice(0, tripleIndex)
            ctx.scanMarkdownTokens(
              textBefore,
              (from, to, cls, atomic) => ctx.addMarkerAlways(from, to, cls, atomic),
              (pat, cls) => {
                for (const match of textBefore.matchAll(pat)) {
                  if (match.index !== undefined) {
                    ctx.addMarkerAlways(match.index, match.index + match[0].length, cls)
                  }
                }
              },
            )
          }
        }
        ctx.addMarkerAlways(tripleIndex, tripleIndex + 3, "cm-md-var-triple-quote")
        ctx.isInsideVarTripleQuotes = false
        const rest = ctx.line.slice(tripleIndex + 3)
        const commentMatch = rest.match(/^(\s*)(#|\/\/)/)
        if (commentMatch) {
          const commentStart = tripleIndex + 3 + rest.indexOf(commentMatch[2])
          ctx.addMarkerAlways(commentStart, ctx.line.length, "cm-md-var-comment")
        } else if (rest.trim()) {
          ctx.addMarkerAlways(tripleIndex + 3, ctx.line.length, "cm-md-var-invalid-text")
          isInvalid = true
        }
      } else {
        if (ctx.line.trim().length > 0) {
          if (ctx.scanMarkdownTokens) {
            ctx.scanMarkdownTokens(
              ctx.line,
              (from, to, cls, atomic) => ctx.addMarkerAlways(from, to, cls, atomic),
              (pat, cls) => {
                for (const match of ctx.line.matchAll(pat)) {
                  if (match.index !== undefined) {
                    ctx.addMarkerAlways(match.index, match.index + match[0].length, cls)
                  }
                }
              },
            )
          }
        }
      }
    } else {
      const trimmed = ctx.line.trim()
      if (trimmed === "") {
        // 空白行属于合法分隔
      } else {
        const commentMatch = ctx.line.match(/^(\s*)(#|\/\/)(.*)$/)
        const standaloneTripleMatch = ctx.line.match(/^(\s*)("""\s*)$/)
        const kvMatch = ctx.line.match(/^(\s*)([A-Za-z0-9_.-]+)\s*(:)(.*)$/)

        if (commentMatch) {
          const commentStart = commentMatch[1].length
          ctx.addMarkerAlways(commentStart, ctx.line.length, "cm-md-var-comment")
        } else if (standaloneTripleMatch) {
          const tripleStart = ctx.line.indexOf('"""')
          ctx.addMarkerAlways(tripleStart, tripleStart + 3, "cm-md-var-triple-quote")
          ctx.isInsideVarTripleQuotes = true
        } else if (kvMatch) {
          const indent = kvMatch[1]
          const key = kvMatch[2]
          const rest = kvMatch[4]
          const keyStart = indent.length
          const keyEnd = keyStart + key.length
          ctx.addMarkerAlways(keyStart, keyEnd, "cm-md-var-key")

          const colonStart = ctx.line.indexOf(":", keyEnd)
          ctx.addMarkerAlways(colonStart, colonStart + 1, "cm-md-var-colon")

          const trimmedRest = rest.trim()
          if (trimmedRest === "") {
            // 纯父级 key，无行内值
          } else if (trimmedRest.startsWith("#") || trimmedRest.startsWith("//")) {
            const commentStart = ctx.line.indexOf(trimmedRest[0], colonStart + 1)
            ctx.addMarkerAlways(commentStart, ctx.line.length, "cm-md-var-comment")
          } else if (
            trimmedRest === "|" ||
            trimmedRest === ">" ||
            trimmedRest === "|-" ||
            trimmedRest === ">-"
          ) {
            const valStart = ctx.line.indexOf(trimmedRest, colonStart + 1)
            ctx.addMarkerAlways(valStart, valStart + trimmedRest.length, "cm-md-var-value")
          } else if (trimmedRest.startsWith('"""')) {
            if (trimmedRest.length >= 6 && trimmedRest.endsWith('"""')) {
              const firstTriple = ctx.line.indexOf('"""', colonStart + 1)
              const lastTriple = ctx.line.lastIndexOf('"""')
              ctx.addMarkerAlways(firstTriple, firstTriple + 3, "cm-md-var-triple-quote")
              if (lastTriple > firstTriple + 3) {
                ctx.addMarkerAlways(firstTriple + 3, lastTriple, "cm-md-var-string")
              }
              ctx.addMarkerAlways(lastTriple, lastTriple + 3, "cm-md-var-triple-quote")
            } else {
              const tripleStart = ctx.line.indexOf('"""', colonStart + 1)
              ctx.addMarkerAlways(tripleStart, tripleStart + 3, "cm-md-var-triple-quote")
              ctx.isInsideVarTripleQuotes = true
              if (tripleStart + 3 < ctx.line.length) {
                const textAfter = ctx.line.slice(tripleStart + 3)
                if (textAfter.trim() && ctx.scanMarkdownTokens) {
                  ctx.scanMarkdownTokens(
                    textAfter,
                    (from, to, cls, atomic) =>
                      ctx.addMarkerAlways(
                        tripleStart + 3 + from,
                        tripleStart + 3 + to,
                        cls,
                        atomic,
                      ),
                    (pat, cls) => {
                      for (const match of textAfter.matchAll(pat)) {
                        if (match.index !== undefined) {
                          ctx.addMarkerAlways(
                            tripleStart + 3 + match.index,
                            tripleStart + 3 + match.index + match[0].length,
                            cls,
                          )
                        }
                      }
                    },
                  )
                }
              }
            }
          } else {
            const stringMatch = rest.match(/^\s*(["'])([\s\S]*?)\1(\s*(?:#|\/\/).*)?$/)
            if (stringMatch) {
              const quoteChar = stringMatch[1]
              const qStart = ctx.line.indexOf(quoteChar, colonStart + 1)
              const qEnd = qStart + 1 + stringMatch[2].length + 1
              ctx.addMarkerAlways(qStart, qEnd, "cm-md-var-string")
              if (stringMatch[3]) {
                const cmt = stringMatch[3].trim()
                const cmtStart = ctx.line.indexOf(cmt[0], qEnd)
                ctx.addMarkerAlways(cmtStart, ctx.line.length, "cm-md-var-comment")
              }
            } else {
              const cmtIdx = rest.search(/\s+(#|\/\/)/)
              if (cmtIdx !== -1) {
                const valPart = rest.slice(0, cmtIdx).trimEnd()
                const valStart = ctx.line.indexOf(valPart.trim(), colonStart + 1)
                ctx.addMarkerAlways(valStart, valStart + valPart.trim().length, "cm-md-var-value")
                const cmtPart = rest.slice(cmtIdx).trimStart()
                const cmtStart = ctx.line.indexOf(cmtPart[0], valStart + valPart.trim().length)
                ctx.addMarkerAlways(cmtStart, ctx.line.length, "cm-md-var-comment")
              } else {
                const valStart = ctx.line.indexOf(trimmedRest, colonStart + 1)
                ctx.addMarkerAlways(valStart, valStart + trimmedRest.length, "cm-md-var-value")
              }
            }
          }
        } else if (ctx.isInsidePresetBlock && /^\s*[-*]\s+/.test(ctx.line)) {
          const listMatch = ctx.line.match(/^(\s*)([-*])(\s+)(.*)$/)
          if (listMatch) {
            const markerStart = listMatch[1].length
            ctx.addMarkerAlways(markerStart, markerStart + 1, "cm-md-var-key")
            ctx.addMarkerAlways(
              markerStart + 1 + listMatch[3].length,
              ctx.line.length,
              "cm-md-var-value",
            )
          }
        } else {
          isInvalid = true
          const firstNonSpace = ctx.line.search(/\S/)
          if (firstNonSpace !== -1) {
            ctx.addMarkerAlways(firstNonSpace, ctx.line.length, "cm-md-var-invalid-text")
          }
        }
      }
    }

    const middleLineClass = ctx.isInsidePresetBlock
      ? "cm-md-preset-middle-line"
      : "cm-md-var-template-middle-line"
    ctx.allDecos.push({
      type: "line",
      from: ctx.offset,
      className: isInvalid ? `${middleLineClass} cm-md-var-invalid-line` : middleLineClass,
    })
    return true
  }

  return false
}
