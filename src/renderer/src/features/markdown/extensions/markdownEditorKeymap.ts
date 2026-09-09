import { indentLess, indentMore } from "@codemirror/commands"
import { EditorState, type Extension, Prec } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import {
  getMarkdownTemplateIdRanges,
  getMarkdownTemplateWtRanges,
  isInsideMarkdownSuppleBlock,
  isInsideMarkdownTemplateBlock,
} from "@/features/markdown/commands/markdownBlockCommands"
import {
  getMarkdownArmedSlashCommand,
  type MarkdownSlashCommand,
} from "@/features/markdown/commands/markdownSlashCommands"
import {
  handleMarkdownVarBlockTab,
  isInsideMarkdownVariableBlock,
} from "@/features/markdown/commands/markdownVariableCommands"
import { getFileMentionDeletionRange } from "@/features/markdown/extensions/markdownFileMentions"
import { createMarkdownFormattingKeymap } from "@/features/markdown/extensions/markdownFormattingKeymap"
import type { UseMarkdownEditorActionsResult } from "@/features/markdown/hooks/useMarkdownEditorActions"
import type { useMarkdownPanels } from "@/features/markdown/hooks/useMarkdownPanels"
import type { UseMarkdownPasteReferenceResult } from "@/features/markdown/hooks/useMarkdownPasteReference"

import type { TranslationKey } from "@/i18n"

export interface CreateMarkdownEditorKeymapOptions {
  paste: UseMarkdownPasteReferenceResult
  panels: ReturnType<typeof useMarkdownPanels>
  actions: UseMarkdownEditorActionsResult
  formattedCustomSlashCommands: MarkdownSlashCommand[]
  onSaveRef: React.MutableRefObject<(() => void) | undefined>
  showToastSuccessRef: React.MutableRefObject<(msg: string) => void>
  t: (key: TranslationKey, options?: Record<string, string | number>) => string
}

/**
 * 模板块 id / 工作区绑定只读保护过滤器：阻止对 {id:...} 与 {wt:...} 文本的局部修改。
 */
export const markdownTemplateProtectionFilter: Extension = EditorState.transactionFilter.of(
  (tr) => {
    if (!tr.docChanged) return tr
    const source = tr.startState.doc.toString()
    if (!source.includes("{id:") && !source.includes("{wt:")) return tr
    const protectedRanges = [
      ...getMarkdownTemplateIdRanges(source),
      ...getMarkdownTemplateWtRanges(source),
    ]
    if (protectedRanges.length === 0) return tr

    let blocked = false
    tr.changes.iterChanges((from, to) => {
      if (blocked) return
      for (const range of protectedRanges) {
        if (from === to) {
          if (from > range.from && from < range.to) {
            blocked = true
            return
          }
        } else if (from >= range.from && to <= range.to) {
          blocked = true
          return
        }
      }
    })
    return blocked ? [] : tr
  },
)

/**
 * 变量模板块全角冒号自动转半角过滤器：
 * 在 $$$ 变量模板块内部输入全角「：」时，实时转换为 YAML 标准半角「:」，确保语法合法且顺畅唤醒选择面板。
 */
export const markdownVarTemplateColonFilter: Extension = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr
  let hasFullWidthColon = false
  tr.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
    if (inserted.toString().includes("：")) {
      hasFullWidthColon = true
    }
  })
  if (!hasFullWidthColon) return tr

  const docText = tr.startState.doc.toString()
  let modified = false
  const newChanges: Array<{ from: number; to: number; insert: string }> = []

  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    const text = inserted.toString()
    if (text.includes("：") && isInsideMarkdownVariableBlock(docText, fromA)) {
      modified = true
      newChanges.push({
        from: fromA,
        to: toA,
        insert: text.replace(/：/g, ":"),
      })
    } else {
      newChanges.push({
        from: fromA,
        to: toA,
        insert: text,
      })
    }
  })

  if (!modified) return tr
  return {
    changes: newChanges,
    selection: tr.selection,
    scrollIntoView: tr.scrollIntoView,
  }
})

/**
 * 构建 Markdown 编辑器快捷键绑定及 DOM 事件监听器。
 */
export const createMarkdownEditorKeymaps = ({
  paste,
  panels,
  actions,
  formattedCustomSlashCommands,
  onSaveRef,
  showToastSuccessRef,
  t,
}: CreateMarkdownEditorKeymapOptions): Extension[] => {
  const formattingKeymap = createMarkdownFormattingKeymap({
    actions,
    onSaveRef,
    showToastSuccessRef,
    t,
  })

  return [
    markdownTemplateProtectionFilter,
    markdownVarTemplateColonFilter,
    Prec.highest(
      keymap.of([
        {
          key: "Tab",
          run: (view) => {
            const colonPanel = panels.colonPanelRef.current
            if (colonPanel?.active) {
              return panels.selectColonOption()
            }
            const fileMention = panels.fileMentionPanelRef.current
            if (fileMention) {
              panels.selectFileMention(
                fileMention.files[panels.activeFileMentionIndexRef.current] ?? fileMention.files[0],
              )
              return true
            }
            const variablePanel = panels.variablePanelRef.current
            if (variablePanel) {
              panels.selectVariable(
                variablePanel.variables[panels.activeVariableIndexRef.current] ??
                  variablePanel.variables[0],
              )
              return true
            }
            const cursor = view.state.selection.main.head
            const line = view.state.doc.lineAt(cursor)
            if (line.text.trim() === "") {
              if (indentMore(view)) return true
              view.dispatch(view.state.replaceSelection("  "))
              return true
            }

            return handleMarkdownVarBlockTab(view, 1)
          },
        },
        {
          key: "Shift-Tab",
          run: (view) => {
            const cursor = view.state.selection.main.head
            const line = view.state.doc.lineAt(cursor)
            if (line.text.trim() === "") {
              return indentLess(view)
            }
            return handleMarkdownVarBlockTab(view, -1)
          },
        },
        {
          key: "ArrowDown",
          run: () =>
            paste.handlePasteReferenceKey(1) ||
            panels.handleColonKey("ArrowDown") ||
            panels.handleVariableKey(1) ||
            panels.handleFileMentionKey("ArrowDown") ||
            panels.handleGitWorktreeKey(1) ||
            panels.handleSendPromptKey(1) ||
            panels.handleSendPromptFlagKey(1) ||
            panels.handleSlashCommandKey(1) ||
            panels.handleBlockCommandKey(1) ||
            panels.handleTemplateFileKey(1),
        },
        {
          key: "ArrowUp",
          run: () =>
            paste.handlePasteReferenceKey(-1) ||
            panels.handleColonKey("ArrowUp") ||
            panels.handleVariableKey(-1) ||
            panels.handleFileMentionKey("ArrowUp") ||
            panels.handleGitWorktreeKey(-1) ||
            panels.handleSendPromptKey(-1) ||
            panels.handleSendPromptFlagKey(-1) ||
            panels.handleSlashCommandKey(-1) ||
            panels.handleBlockCommandKey(-1) ||
            panels.handleTemplateFileKey(-1),
        },
        {
          key: "Enter",
          run: (view) => {
            const pastePanel = paste.pasteReferencePanelRef.current
            if (pastePanel) {
              return paste.selectPasteReference(
                paste.activePasteReferenceIndexRef.current === 0 ? "reference" : "path",
              )
            }

            const fileMention = panels.fileMentionPanelRef.current
            if (fileMention) {
              panels.selectFileMention(
                fileMention.files[panels.activeFileMentionIndexRef.current] ?? fileMention.files[0],
              )
              return true
            }

            const gitWorktree = panels.gitWorktreePanelRef.current
            if (gitWorktree) {
              panels.selectGitWorktree(
                gitWorktree.options[panels.activeGitWorktreeIndexRef.current] ??
                  gitWorktree.options[0],
              )
              return true
            }

            const sendPrompt = panels.sendPromptPanelRef.current
            if (sendPrompt) {
              panels.selectSendPrompt(
                sendPrompt.options[panels.activeSendPromptIndexRef.current] ??
                  sendPrompt.options[0],
                "auto",
              )
              return true
            }

            const sendPromptFlag = panels.sendPromptFlagPanelRef.current
            if (sendPromptFlag) {
              panels.selectSendPromptFlag(
                sendPromptFlag.options[panels.activeSendPromptFlagIndexRef.current] ??
                  sendPromptFlag.options[0],
              )
              return true
            }

            const slashCommand = panels.slashCommandPanelRef.current
            if (slashCommand) {
              panels.selectSlashCommand(
                slashCommand.commands[panels.activeSlashCommandIndexRef.current] ??
                  slashCommand.commands[0],
              )
              return true
            }

            const blockPanel = panels.blockCommandPanelRef.current
            if (blockPanel) {
              panels.selectBlockCommand(
                blockPanel.commands[panels.activeBlockCommandIndexRef.current] ??
                  blockPanel.commands[0],
              )
              return true
            }

            const templateFilePanel = panels.templateFilePanelRef.current
            if (templateFilePanel) {
              panels.selectTemplateFile(
                templateFilePanel.files[panels.activeTemplateFileIndexRef.current] ??
                  templateFilePanel.files[0],
              )
              return true
            }

            const variablePanel = panels.variablePanelRef.current
            if (variablePanel) {
              panels.selectVariable(
                variablePanel.variables[panels.activeVariableIndexRef.current] ??
                  variablePanel.variables[0],
              )
              return true
            }

            const colonPanel = panels.colonPanelRef.current
            if (colonPanel?.active) {
              return panels.selectColonOption()
            }

            const cursor = view.state.selection.main.head
            const line = view.state.doc.lineAt(cursor)
            const isInsideSupple = isInsideMarkdownSuppleBlock(
              view.state.doc.sliceString(0, line.from),
            )
            const isInsideTemplate = isInsideMarkdownTemplateBlock(
              view.state.doc.sliceString(0, line.from),
            )
            const isInsideAnyBlock = isInsideSupple || isInsideTemplate

            const armedCommand = getMarkdownArmedSlashCommand(
              line.text,
              isInsideAnyBlock,
              formattedCustomSlashCommands,
            )
            if (armedCommand) {
              if (armedCommand.id === "sendPrompt") {
                actions.runSendPromptDispatch(view)
              } else if (armedCommand.kind === "select") {
                actions.runGitWorktreeSwitch(view)
              } else {
                actions.runTemplateTitleGeneration(view)
              }
              return true
            }

            const templateEndMatch =
              /^(\s*)&&&(?:\s+(?:[A-Za-z]\w*)\s+--end|\s+--end)?(?:\s+(?:done|in_progress))?(?:\s+\{id:[0-9a-f]{32}\})?(?:\s+\{wt:[^}\s{]+\})?\s*$/.exec(
                line.text,
              )
            if (cursor === line.to && templateEndMatch && isInsideTemplate) {
              const currentIndent = templateEndMatch[1] ?? ""
              const insertText = `\n${currentIndent}`
              view.dispatch({
                changes: { from: cursor, to: cursor, insert: insertText },
                selection: { anchor: cursor + insertText.length },
              })
              return true
            }

            const emptyListMarkerRegex = /^(\s*)([-+*](\s+\[[ xX]\])?|\d+[.)]|>)\s*$/
            if (emptyListMarkerRegex.test(line.text)) {
              view.dispatch({
                changes: { from: line.from, to: line.to, insert: "" },
                selection: { anchor: line.from },
              })
              return true
            }

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
          key: "Mod-d",
          run: () => {
            const sendPrompt = panels.sendPromptPanelRef.current
            if (sendPrompt) {
              panels.selectSendPrompt(
                sendPrompt.options[panels.activeSendPromptIndexRef.current] ??
                  sendPrompt.options[0],
                "horizontal",
              )
              return true
            }
            return false
          },
        },
        {
          key: "Mod-Shift-d",
          run: () => {
            const sendPrompt = panels.sendPromptPanelRef.current
            if (sendPrompt) {
              panels.selectSendPrompt(
                sendPrompt.options[panels.activeSendPromptIndexRef.current] ??
                  sendPrompt.options[0],
                "vertical",
              )
              return true
            }
            return false
          },
        },
        {
          key: "Mod-t",
          run: () => {
            const sendPrompt = panels.sendPromptPanelRef.current
            if (sendPrompt) {
              panels.selectSendPrompt(
                sendPrompt.options[panels.activeSendPromptIndexRef.current] ??
                  sendPrompt.options[0],
                "tab",
              )
              return true
            }
            return false
          },
        },
        {
          key: "Escape",
          run: () => {
            if (paste.pasteReferencePanelRef.current) {
              paste.closePasteReferencePanel()
              return true
            }
            if (panels.fileMentionPanelRef.current) {
              panels.closeFileMentionPanel()
              return true
            }
            if (panels.slashCommandPanelRef.current) {
              panels.closeSlashCommandPanel()
              return true
            }
            if (panels.gitWorktreePanelRef.current) {
              panels.closeGitWorktreePanel()
              return true
            }
            if (panels.sendPromptPanelRef.current) {
              panels.closeSendPromptPanel()
              return true
            }
            if (panels.sendPromptFlagPanelRef.current) {
              panels.closeSendPromptFlagPanel()
              return true
            }
            if (panels.blockCommandPanelRef.current) {
              panels.blockCommandPanelRef.current = null
              panels.setBlockCommandPanel(null)
              return true
            }
            if (panels.templateFilePanelRef.current) {
              panels.closeTemplateFilePanel()
              return true
            }
            if (panels.variablePanelRef.current) {
              panels.closeVariablePanel()
              return true
            }
            if (panels.colonPanelRef.current?.active) {
              panels.closeColonPanel()
              return true
            }
            return false
          },
        },
      ]),
    ),
    Prec.high(
      EditorView.domEventHandlers({
        paste: (event, view) => paste.handleClipboardPaste(event, view),
        keydown: (event, view) => {
          if (event.key !== "Backspace" || panels.fileMentionPanelRef.current) return false

          const { selection } = view.state
          if (!selection.main.empty) return false

          const cursor = selection.main.head
          const deletionRange = getFileMentionDeletionRange(view.state.doc.toString(), cursor)
          if (!deletionRange) return false

          event.preventDefault()
          view.dispatch({
            changes: { from: deletionRange.start, to: deletionRange.end, insert: "" },
            selection: { anchor: deletionRange.start },
            userEvent: "delete.backward",
          })
          panels.closeFileMentionPanel()
          return true
        },
      }),
    ),
    formattingKeymap,
  ]
}
