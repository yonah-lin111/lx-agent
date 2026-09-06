import { RangeSetBuilder, StateEffect } from "@codemirror/state"
import { Decoration, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from "@codemirror/view"
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
import { MARKDOWN_REFERENCE_PATTERN } from "@/features/markdown/extensions/markdownReferenceHover"
import {
  extractParentTemplateCopyContent,
  stripEmptyTemplateItems,
  stripMarkdownSubblockFences,
  stripMarkdownSubblocks,
  stripMarkdownTemplateComments,
} from "@/features/markdown/utils/markdownRenderer"

// 代码块或模板块折叠状态变更事件。
const markdownBlockFoldToggleEffect = StateEffect.define<void>()

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
    if (!this.isLog) {
      actionNodes.push(
        createElement(MarkdownActionCopyButton, {
          text: this.codeText,
          label: this.copyTitle,
          isTemplate,
          isSupple: this.isSupple,
          isLog: this.isLog,
        }),
      )
    }
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
      /^(\s*)&&&\s+(?!done\b|in_progress\b)([A-Za-z]\w*)(?:\s+(--start))?(?:\s+「title:[^」\n]*」)?\s*$/,
    )
    const templateEndMatch = line.match(
      /^\s*&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/,
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
      if (templateStartMatch[3]) {
        const flagIndex = line.indexOf(templateStartMatch[3], commandIndex + commandName.length)
        if (flagIndex !== -1) {
          addMarkerAlways(
            flagIndex,
            flagIndex + templateStartMatch[3].length,
            "cm-md-template-flag",
          )
        }
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
                extractParentTemplateCopyContent(currentTemplateTextLines.join("\n")),
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
      const endCommandMatch = line.match(/^(\s*)&&&\s+([A-Za-z]\w*)/)
      if (endCommandMatch) {
        const endCmdName = endCommandMatch[2]
        const endCmdIndex = line.indexOf(endCmdName, markerStart + 3)
        if (endCmdIndex !== -1) {
          addMarkerAlways(
            endCmdIndex,
            endCmdIndex + endCmdName.length,
            `cm-md-template-command cm-md-template-command-${endCmdName}`,
          )
        }
      }
      const endFlagMatch = line.match(/--end/)
      if (endFlagMatch?.index !== undefined) {
        addMarkerAlways(
          endFlagMatch.index,
          endFlagMatch.index + endFlagMatch[0].length,
          "cm-md-template-flag",
        )
      }
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
        const commandMatch = line.match(/\+\+\+\s+(suppleTemplate|supple)\s+(--start)/)
        if (commandMatch && commandMatch.index !== undefined) {
          const commandStart = line.indexOf(commandMatch[1], markerStart + 3)
          if (commandStart !== -1) {
            addMarkerAlways(
              commandStart,
              commandStart + commandMatch[1].length,
              "cm-md-supple-command",
            )
            const flagStart = line.indexOf(commandMatch[2], commandStart + commandMatch[1].length)
            if (flagStart !== -1) {
              addMarkerAlways(flagStart, flagStart + commandMatch[2].length, "cm-md-supple-flag")
            }
          }
        }
        allDecos.push({
          type: "widget",
          from: offset + line.length,
          to: offset + line.length,
          widget: new CodeBlockActionWidget(
            stripEmptyTemplateItems(
              stripMarkdownTemplateComments(
                extractParentTemplateCopyContent(currentSuppleTextLines.join("\n")),
              ),
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
        const endCommandMatch = line.match(/\+\+\+\s+(suppleTemplate|supple)\s+(--end)/)
        if (endCommandMatch && endCommandMatch.index !== undefined) {
          const commandStart = line.indexOf(endCommandMatch[1], markerStart + 3)
          if (commandStart !== -1) {
            addMarkerAlways(
              commandStart,
              commandStart + endCommandMatch[1].length,
              "cm-md-supple-command",
            )
            const flagStart = line.indexOf(
              endCommandMatch[2],
              commandStart + endCommandMatch[1].length,
            )
            if (flagStart !== -1) {
              addMarkerAlways(flagStart, flagStart + endCommandMatch[2].length, "cm-md-supple-flag")
            }
          }
        }
        // id 为系统分配标识：着色展示并设为原子范围，光标导航跳过、源码受事务过滤器保护。
        const idMatch = line.match(/\{id:[0-9a-f]{32}\}/)
        if (idMatch?.index !== undefined) {
          addMarkerAlways(
            idMatch.index,
            idMatch.index + idMatch[0].length,
            "cm-md-template-id",
            true,
          )
        }
        // wt 为工作区绑定：着色展示并设为原子范围，光标导航跳过、源码受事务过滤器保护。
        const wtMatch = line.match(/\{wt:[^}\s{]+\}/)
        if (wtMatch?.index !== undefined) {
          addMarkerAlways(
            wtMatch.index,
            wtMatch.index + wtMatch[0].length,
            "cm-md-template-wt",
            true,
          )
        }
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
        const commandMatch = line.match(/\+\+\+\s+(logTemplate|log)\s+(--start)/)
        if (commandMatch && commandMatch.index !== undefined) {
          const commandStart = line.indexOf(commandMatch[1], markerStart + 3)
          if (commandStart !== -1) {
            addMarkerAlways(
              commandStart,
              commandStart + commandMatch[1].length,
              "cm-md-log-command",
            )
            const flagStart = line.indexOf(commandMatch[2], commandStart + commandMatch[1].length)
            if (flagStart !== -1) {
              addMarkerAlways(flagStart, flagStart + commandMatch[2].length, "cm-md-log-flag")
            }
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
        const endCommandMatch = line.match(/\+\+\+\s+(logTemplate|log)\s+(--end)/)
        if (endCommandMatch && endCommandMatch.index !== undefined) {
          const commandStart = line.indexOf(endCommandMatch[1], markerStart + 3)
          if (commandStart !== -1) {
            addMarkerAlways(
              commandStart,
              commandStart + endCommandMatch[1].length,
              "cm-md-log-command",
            )
            const flagStart = line.indexOf(
              endCommandMatch[2],
              commandStart + endCommandMatch[1].length,
            )
            if (flagStart !== -1) {
              addMarkerAlways(flagStart, flagStart + endCommandMatch[2].length, "cm-md-log-flag")
            }
          }
        }
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
