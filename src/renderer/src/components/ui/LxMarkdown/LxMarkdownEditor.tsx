import {
  deleteLine,
  history,
  historyKeymap,
  indentLess,
  indentMore,
  redo,
  standardKeymap,
  undo,
} from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState, Prec } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import {
  Bold,
  Code,
  Code2,
  Eye,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Redo2,
  SquareSplitHorizontal,
  Strikethrough,
  Undo2,
} from "lucide-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { MarkdownBlockCommandMenu } from "@/components/ui/LxMarkdown/components/MarkdownBlockCommandMenu"
import { MarkdownEditorToolbar } from "@/components/ui/LxMarkdown/components/MarkdownEditorToolbar"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import type {
  MarkdownBlockCommand,
  MarkdownBlockTrigger,
} from "@/components/ui/LxMarkdown/markdownBlockCommands"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/components/ui/LxMarkdown/markdownBlockCommands"
import {
  createMarkdownTable,
  editorTheme,
  markdownHighlightStyle,
  markdownMarkerHighlight,
  selectAllPreservingScrollPosition,
  synchronizeEditorToPreview,
  synchronizePreviewToEditor,
} from "@/components/ui/LxMarkdown/markdownEditorExtensions"
import { markdownRenderer } from "@/components/ui/LxMarkdown/markdownRenderer"
import type {
  EditorScrollAnchor,
  LxMarkdownEditorProps,
  MarkdownPreviewMode,
  MarkdownToolbarAction,
} from "@/components/ui/LxMarkdown/types"

// Markdown 块命令面板状态。
interface MarkdownBlockCommandPanelState {
  commands: MarkdownBlockCommand[]
  position: React.CSSProperties
  trigger: MarkdownBlockTrigger
}

/**
 * 渲染可编辑、预览和分栏浏览模式的 Markdown 编辑器。
 */
export const LxMarkdownEditor = ({
  initialContent = "",
  onChange,
  onSave,
  isSaved = true,
}: LxMarkdownEditorProps): React.JSX.Element => {
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorViewRef = useRef<EditorView | null>(null)
  const previewRef = useRef<HTMLElement>(null)
  const editorScrollAnchorRef = useRef<EditorScrollAnchor | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const blockCommandPanelRef = useRef<MarkdownBlockCommandPanelState | null>(null)
  const activeBlockCommandIndexRef = useRef(0)
  const [content, setContent] = useState(initialContent)
  const [previewMode, setPreviewMode] = useState<MarkdownPreviewMode>("edit")
  const [blockCommandPanel, setBlockCommandPanel] = useState<MarkdownBlockCommandPanelState | null>(
    null,
  )
  const [activeBlockCommandIndex, setActiveBlockCommandIndex] = useState(0)
  const previewHtml = useMemo(() => markdownRenderer.render(content), [content])

  const previewModeRef = useRef(previewMode)
  useEffect(() => {
    previewModeRef.current = previewMode
  }, [previewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const isModKey = event.metaKey || event.ctrlKey
      const isShift = event.shiftKey

      if (isModKey && isShift) {
        const key = event.key.toLowerCase()
        if (key === "e") {
          event.preventDefault()
          const currentMode = previewModeRef.current
          changePreviewMode(currentMode === "split" ? "edit" : "split")
        } else if (key === "v") {
          event.preventDefault()
          const currentMode = previewModeRef.current
          changePreviewMode(currentMode === "preview" ? "edit" : "preview")
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  /**
   * 更新 Markdown 块命令面板的候选项及其相对光标的位置。
   */
  const syncBlockCommandPanel = (view: EditorView): void => {
    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
    // 针对代码块命令，由于会在行末尾插入一个 CodeBlockActionWidget 挂件，
    // CodeMirror 的 coordsAtPos(cursor) 会受到绝对定位挂件的影响而返回远端最右侧的坐标。
    // 为此，当触发器为 codeBlock 且光标不在行首时，我们测量光标前一个字符的坐标。
    const measurePos = trigger?.kind === "codeBlock" && cursor > line.from ? cursor - 1 : cursor
    const coords = view.coordsAtPos(measurePos)
    const isClosingCodeFence =
      trigger?.kind === "codeBlock" &&
      isInsideMarkdownCodeFence(view.state.doc.sliceString(0, line.from))

    let isContinuousList = false
    if (trigger && (trigger.kind === "unorderedList" || trigger.kind === "orderedList")) {
      if (line.number > 1) {
        const prevLine = view.state.doc.line(line.number - 1)
        const prevText = prevLine.text
        if (trigger.kind === "unorderedList") {
          if (/^(\s*)[-+*](\s|$)/.test(prevText)) {
            isContinuousList = true
          }
        } else if (trigger.kind === "orderedList") {
          if (/^(\s*)\d+[.)](\s|$)/.test(prevText)) {
            isContinuousList = true
          }
        }
      }
    }

    const commands =
      trigger && !isClosingCodeFence && !isContinuousList
        ? getMarkdownBlockCommands(trigger.kind)
        : []

    if (!trigger || !coords || commands.length === 0) {
      blockCommandPanelRef.current = null
      activeBlockCommandIndexRef.current = 0
      setBlockCommandPanel(null)
      setActiveBlockCommandIndex(0)
      return
    }

    const panelWidth = 256
    const offset = 6
    const coordsLeft =
      trigger?.kind === "codeBlock" && cursor > line.from ? coords.right : coords.left
    const left = Math.min(Math.max(coordsLeft, 8), Math.max(window.innerWidth - panelWidth - 8, 8))
    const panel = {
      commands,
      trigger,
      position:
        window.innerHeight - coords.bottom < window.innerHeight * 0.3
          ? { left, top: "auto", bottom: window.innerHeight - coords.top + offset }
          : { left, top: coords.bottom + offset, bottom: "auto" },
    }
    const previous = blockCommandPanelRef.current
    if (previous?.trigger.kind !== trigger.kind || previous.trigger.to !== trigger.to) {
      activeBlockCommandIndexRef.current = 0
      setActiveBlockCommandIndex(0)
    }
    blockCommandPanelRef.current = panel
    setBlockCommandPanel(panel)
  }

  /**
   * 将当前触发标记替换为用户选择的 Markdown 块模板。
   */
  const selectBlockCommand = (command: MarkdownBlockCommand): void => {
    const view = editorViewRef.current
    if (!view) return

    const cursor = view.state.selection.main.head
    const line = view.state.doc.lineAt(cursor)
    const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
    if (!trigger) return

    let insertion = createMarkdownBlockInsertion(command.id)

    // 针对代码块命令，检测当前代码块是否已经是闭合状态，防止出现重复的 ```
    if (command.id === "codeBlock" && line.number < view.state.doc.lines) {
      const fenceChar = line.text.trim()[0] || "`"
      const fenceLength = line.text.trim().length
      const fenceString = fenceChar.repeat(fenceLength)
      let hasClosingFence = false

      for (let i = line.number + 1; i <= view.state.doc.lines; i++) {
        const currLineText = view.state.doc.line(i).text.trim()
        if (currLineText.startsWith(fenceString)) {
          if (currLineText === fenceString) {
            hasClosingFence = true
          }
          break
        }
      }

      if (hasClosingFence) {
        insertion = {
          text: `${fenceString}language`,
          selectionStart: fenceLength,
          selectionEnd: fenceLength + 8,
        }
      }
    }

    view.dispatch({
      changes: { from: trigger.from, to: trigger.to, insert: insertion.text },
      selection: {
        anchor: trigger.from + insertion.selectionStart,
        head: trigger.from + insertion.selectionEnd,
      },
    })
    view.focus()
  }

  /**
   * 切换菜单高亮项，并保持键盘选择状态与视图一致。
   */
  const setActiveBlockCommand = (index: number): void => {
    activeBlockCommandIndexRef.current = index
    setActiveBlockCommandIndex(index)
  }

  /**
   * 处理 Markdown 块命令菜单的键盘选择。
   */
  const handleBlockCommandKey = (offset: number): boolean => {
    const panel = blockCommandPanelRef.current
    if (!panel) return false

    const nextIndex =
      (activeBlockCommandIndexRef.current + offset + panel.commands.length) % panel.commands.length
    setActiveBlockCommand(nextIndex)
    return true
  }

  /**
   * 在当前选区插入内容，并将焦点还给编辑器。
   */
  const insertText = (text: string, selectionOffset = text.length): void => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + selectionOffset },
    })
    view.focus()
  }

  /**
   * 为选区包裹 Markdown 标记；无选区时插入可直接替换的占位内容。
   */
  const wrapSelection = (prefix: string, suffix: string, placeholder: string): void => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)
    const innerText = selectedText || placeholder
    const insert = `${prefix}${innerText}${suffix}`
    view.dispatch({
      changes: { from, to, insert },
      selection: selectedText
        ? { anchor: from + prefix.length, head: from + prefix.length + innerText.length }
        : { anchor: from + prefix.length, head: from + prefix.length + placeholder.length },
    })
    view.focus()
  }

  /**
   * 插入或包裹代码块。
   */
  const insertCodeBlock = (): void => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)

    if (selectedText) {
      const insert = `\`\`\`\n${selectedText}\n\`\`\``
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 4, head: from + 4 + selectedText.length },
      })
    } else {
      const insert = "```language\n```"
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + 3, head: from + 11 },
      })
    }
    view.focus()
  }

  /**
   * 在选择的每一行前添加 Markdown 列表或引用前缀。
   */
  const prefixLines = (prefix: string, placeholder: string): void => {
    const view = editorViewRef.current
    if (!view) return

    const { from, to } = view.state.selection.main
    const selectedText = view.state.doc.sliceString(from, to)
    const insert = selectedText
      ? `${prefix}${selectedText.replaceAll("\n", `\n${prefix}`)}`
      : `${prefix}${placeholder}`
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + prefix.length, head: from + insert.length },
    })
    view.focus()
  }

  /**
   * 在当前选区的每一行前添加指定层级的 Markdown 标题标记。
   */
  const addHeading = (level: number): void => {
    prefixLines(`${"#".repeat(level)} `, "Heading")
  }

  /**
   * 在编辑区宽度变更前记录首个可见行，供测量完成后恢复视觉位置。
   */
  const changePreviewMode = (mode: MarkdownPreviewMode): void => {
    const view = editorViewRef.current
    if (view) {
      const { scrollLeft, scrollTop } = view.scrollDOM
      const block = view.lineBlockAtHeight(scrollTop)
      editorScrollAnchorRef.current = {
        left: scrollLeft,
        line: view.state.doc.lineAt(block.from).number,
        offset: scrollTop - block.top,
      }
    }

    setPreviewMode(mode)
  }

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container) return

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        markdown({
          codeLanguages: languages,
          extensions: [GFM, { remove: ["SetextHeading"] }],
        }),
        syntaxHighlighting(markdownHighlightStyle),
        editorTheme,
        markdownMarkerHighlight,
        EditorView.lineWrapping,
        indentUnit.of("  "),
        indentOnInput(),
        bracketMatching(),
        Prec.highest(
          keymap.of([
            { key: "ArrowDown", run: () => handleBlockCommandKey(1) },
            { key: "ArrowUp", run: () => handleBlockCommandKey(-1) },
            {
              key: "Enter",
              run: (view) => {
                const panel = blockCommandPanelRef.current
                if (panel) {
                  selectBlockCommand(
                    panel.commands[activeBlockCommandIndexRef.current] ?? panel.commands[0],
                  )
                  return true
                }

                const cursor = view.state.selection.main.head
                const line = view.state.doc.lineAt(cursor)
                const emptyListMarkerRegex = /^(\s*)([-+*](\s+\[[ xX]\])?|\d+[.)]|>)\s*$/
                if (emptyListMarkerRegex.test(line.text)) {
                  view.dispatch({
                    changes: { from: line.from, to: line.to, insert: "" },
                    selection: { anchor: line.from },
                  })
                  return true
                }

                // 括号对智能换行缩进处理
                if (cursor > 0 && cursor < view.state.doc.length) {
                  const prevChar = view.state.doc.sliceString(cursor - 1, cursor)
                  const nextChar = view.state.doc.sliceString(cursor, cursor + 1)
                  if (
                    (prevChar === "{" && nextChar === "}") ||
                    (prevChar === "[" && nextChar === "]") ||
                    (prevChar === "(" && nextChar === ")")
                  ) {
                    const indentMatch = line.text.match(/^(\s*)/)
                    const currentIndent = indentMatch ? indentMatch[1] : ""
                    const insertText = `\n${currentIndent}  \n${currentIndent}`
                    view.dispatch({
                      changes: { from: cursor, to: cursor, insert: insertText },
                      selection: { anchor: cursor + 1 + currentIndent.length + 2 },
                    })
                    return true
                  }
                }

                return false
              },
            },
            {
              key: "Escape",
              run: () => {
                if (!blockCommandPanelRef.current) return false
                blockCommandPanelRef.current = null
                setBlockCommandPanel(null)
                return true
              },
            },
          ]),
        ),
        keymap.of([
          {
            key: "Ctrl-Shift-Enter",
            run: (view) => {
              const cursor = view.state.selection.main.head
              const line = view.state.doc.lineAt(cursor)
              const indentMatch = line.text.match(/^(\s*)/)
              const currentIndent = indentMatch ? indentMatch[1] : ""
              const insertText = `\n${currentIndent}`
              view.dispatch({
                changes: { from: line.to, to: line.to, insert: insertText },
                selection: { anchor: line.to + insertText.length },
              })
              return true
            },
          },
          {
            key: "Cmd-Shift-Enter",
            run: (view) => {
              const cursor = view.state.selection.main.head
              const line = view.state.doc.lineAt(cursor)
              const indentMatch = line.text.match(/^(\s*)/)
              const currentIndent = indentMatch ? indentMatch[1] : ""
              const insertText = `\n${currentIndent}`
              view.dispatch({
                changes: { from: line.to, to: line.to, insert: insertText },
                selection: { anchor: line.to + insertText.length },
              })
              return true
            },
          },
          { key: "Mod-a", run: selectAllPreservingScrollPosition },
          {
            key: "Mod-s",
            run: () => {
              onSaveRef.current?.()
              return true
            },
          },
          { key: "Tab", run: indentMore },
          { key: "Shift-Tab", run: indentLess },
          { key: "Mod-d", run: deleteLine },
          { key: "Mod-b", run: () => (wrapSelection("**", "**", "bold"), true) },
          { key: "Mod-i", run: () => (wrapSelection("_", "_", "italic"), true) },
          { key: "Mod-1", run: () => (addHeading(1), true) },
          { key: "Mod-2", run: () => (addHeading(2), true) },
          { key: "Mod-3", run: () => (addHeading(3), true) },
          { key: "Mod-4", run: () => (addHeading(4), true) },
          { key: "Mod-5", run: () => (addHeading(5), true) },
          { key: "Mod-6", run: () => (addHeading(6), true) },
          { key: "Mod-o", run: () => (prefixLines("1. ", "Item"), true) },
          { key: "Mod-l", run: () => (wrapSelection("[", "](https://)", "link text"), true) },
          { key: "Mod-Shift-s", run: () => (wrapSelection("~~", "~~", "strikethrough"), true) },
          { key: "Mod-Shift-u", run: () => (prefixLines("- ", "Item"), true) },
          { key: "Mod-Shift-c", run: () => (insertCodeBlock(), true) },
          { key: "Mod-Shift-8", run: () => (prefixLines("1. ", "Item"), true) },
          { key: "Mod-Shift-9", run: () => (prefixLines("- ", "Item"), true) },
          { key: "Mod-Alt-c", run: () => (wrapSelection("`", "`", "code"), true) },
          {
            key: "Mod-Shift-Alt-t",
            run: () => (insertText(createMarkdownTable({ columns: 2, rows: 2 })), true),
          },
          ...historyKeymap,
          ...standardKeymap,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet || update.viewportChanged) {
            syncBlockCommandPanel(update.view)
          }
          if (update.docChanged) {
            const nextContent = update.state.doc.toString()
            setContent(nextContent)
            onChangeRef.current?.(nextContent)
          }
        }),
      ],
    })
    const view = new EditorView({ state, parent: container })
    editorViewRef.current = view

    return () => {
      editorViewRef.current = null
      view.destroy()
    }
  }, [])

  useLayoutEffect(() => {
    const anchor = editorScrollAnchorRef.current
    const view = editorViewRef.current
    if (!anchor || !view) return

    view.requestMeasure({
      read: () => anchor,
      write: (scrollAnchor, measuredView) => {
        const line = measuredView.state.doc.line(
          Math.min(scrollAnchor.line, measuredView.state.doc.lines),
        )
        const block = measuredView.lineBlockAt(line.from)
        measuredView.scrollDOM.scrollTo({
          left: scrollAnchor.left,
          top: block.top + scrollAnchor.offset,
        })
        if (editorScrollAnchorRef.current === scrollAnchor) {
          editorScrollAnchorRef.current = null
        }
      },
    })
  }, [previewMode])

  useEffect(() => {
    if (previewMode !== "split") return

    const editorScrollElement = editorViewRef.current?.scrollDOM
    const previewElement = previewRef.current
    if (!editorScrollElement || !previewElement) return

    let restoreListenerTimer: number | null = null

    const synchronize = (
      target: HTMLElement,
      targetListener: EventListener,
      synchronizeTarget: () => void,
    ): void => {
      target.removeEventListener("scroll", targetListener)
      synchronizeTarget()
      if (restoreListenerTimer !== null) window.clearTimeout(restoreListenerTimer)
      restoreListenerTimer = window.setTimeout(() => {
        target.addEventListener("scroll", targetListener)
        restoreListenerTimer = null
      }, 50)
    }

    const synchronizePreview = (): void =>
      synchronize(previewElement, synchronizeEditor, () =>
        synchronizeEditorToPreview(editorViewRef.current!, previewElement),
      )
    const synchronizeEditor = (): void =>
      synchronize(editorScrollElement, synchronizePreview, () =>
        synchronizePreviewToEditor(previewElement, editorViewRef.current!),
      )
    const previewContentElement = previewElement.querySelector(".markdown-preview-content")
    const previewContentObserver = new ResizeObserver(() => synchronizePreview())

    editorScrollElement.addEventListener("scroll", synchronizePreview)
    previewElement.addEventListener("scroll", synchronizeEditor)
    if (previewContentElement) previewContentObserver.observe(previewContentElement)
    synchronizePreview()

    return () => {
      editorScrollElement.removeEventListener("scroll", synchronizePreview)
      previewElement.removeEventListener("scroll", synchronizeEditor)
      previewContentObserver.disconnect()
      if (restoreListenerTimer !== null) window.clearTimeout(restoreListenerTimer)
    }
  }, [previewHtml, previewMode])

  const isMacOS = navigator.userAgent.includes("Macintosh")
  const splitLabel = isMacOS ? "双栏预览 (Cmd+Shift+E)" : "双栏预览 (Ctrl+Shift+E)"
  const previewLabel = isMacOS ? "仅预览 (Cmd+Shift+V)" : "仅预览 (Ctrl+Shift+V)"

  const actions: MarkdownToolbarAction[] = [
    {
      icon: Undo2,
      label: "撤销",
      onClick: () => editorViewRef.current && undo(editorViewRef.current),
    },
    {
      icon: Redo2,
      label: "重做",
      onClick: () => editorViewRef.current && redo(editorViewRef.current),
    },
    { icon: Bold, label: "粗体", onClick: () => wrapSelection("**", "**", "bold") },
    { icon: Italic, label: "斜体", onClick: () => wrapSelection("_", "_", "italic") },
    {
      icon: Strikethrough,
      label: "删除线",
      onClick: () => wrapSelection("~~", "~~", "strikethrough"),
    },
    { icon: List, label: "无序列表", onClick: () => prefixLines("- ", "Item") },
    { icon: ListOrdered, label: "有序列表", onClick: () => prefixLines("1. ", "Item") },
    { icon: ListTodo, label: "任务列表", onClick: () => prefixLines("- [ ] ", "Task") },
    { icon: Quote, label: "引用", onClick: () => prefixLines("> ", "Quote") },
    { icon: Code2, label: "行内代码", onClick: () => wrapSelection("`", "`", "code") },
    { icon: Code, label: "代码块", onClick: insertCodeBlock },
    { icon: Link, label: "链接", onClick: () => wrapSelection("[", "](https://)", "link text") },
    {
      icon: SquareSplitHorizontal,
      label: splitLabel,
      onClick: () => changePreviewMode(previewMode === "split" ? "edit" : "split"),
      alignRight: true,
      highlighted: previewMode === "split",
    },
    {
      icon: Eye,
      label: previewLabel,
      onClick: () => changePreviewMode(previewMode === "preview" ? "edit" : "preview"),
      highlighted: previewMode === "preview",
    },
  ]

  return (
    <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      <MarkdownEditorToolbar
        actions={actions}
        isSaved={isSaved}
        onInsertTable={(size) => insertText(createMarkdownTable(size))}
      />
      <div className="min-h-0 flex flex-1 text-sm">
        <div
          ref={editorContainerRef}
          className={`min-h-0 min-w-0 flex-1 ${previewMode === "preview" ? "hidden" : ""}`}
        />
        {previewMode !== "edit" && (
          <LxMarkdownPreview html={previewHtml} previewMode={previewMode} previewRef={previewRef} />
        )}
      </div>
      {blockCommandPanel && (
        <MarkdownBlockCommandMenu
          activeIndex={activeBlockCommandIndex}
          commands={blockCommandPanel.commands}
          position={blockCommandPanel.position}
          onActiveIndexChange={setActiveBlockCommand}
          onSelect={selectBlockCommand}
        />
      )}
    </section>
  )
}
