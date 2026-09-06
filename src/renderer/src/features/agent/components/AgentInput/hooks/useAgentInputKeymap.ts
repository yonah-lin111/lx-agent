import type { Extension } from "@codemirror/state"
import { Prec } from "@codemirror/state"
import type { EditorView } from "@codemirror/view"
import { keymap } from "@codemirror/view"
import type { MutableRefObject, RefObject } from "react"
import type { GitWorktreeOption } from "@/features/git"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import type {
  AgentInputCommand,
  AgentInputModel,
  AgentMentionItem,
} from "../AgentInputCommandPanels"

export interface AgentInputKeymapOptions {
  pastePanelRef: MutableRefObject<any>
  pasteOptionsRef: MutableRefObject<any[]>
  pasteIndexRef: MutableRefObject<number>
  setPasteIndex: (updater: (i: number) => number) => void
  closePastePanel: (restore?: boolean) => void
  selectPasteReference: (mode: "reference" | "path" | "upload") => boolean

  activeModeRef: MutableRefObject<string | null>
  setActiveMode: (mode: any) => void
  undoConfirmIndexRef: MutableRefObject<number>
  setUndoConfirmIndex: (updater: (i: number) => number) => void

  matchedCommandsRef: MutableRefObject<AgentInputCommand[]>
  commandIndexRef: MutableRefObject<number>
  setCommandIndex: (updater: (i: number) => number) => void
  executeCommand: (cmd: AgentInputCommand) => void

  matchedModelsRef: MutableRefObject<AgentInputModel[]>
  modelIndexRef: MutableRefObject<number>
  setModelIndex: (updater: (i: number) => number) => void
  selectModel: (model: AgentInputModel) => void

  matchedWorktreesRef: MutableRefObject<GitWorktreeOption[]>
  worktreeIndexRef: MutableRefObject<number>
  setWorktreeIndex: (updater: (i: number) => number) => void
  selectWorktree: (opt: GitWorktreeOption) => void

  mentionItemsRef: MutableRefObject<AgentMentionItem[]>
  fileIndexRef: MutableRefObject<number>
  setFileIndex: (updater: (i: number) => number) => void
  selectFile: (file: any) => void
  selectSkillFromMention: (skill: any) => void

  matchedSkillsRef: MutableRefObject<any[]>
  skillIndexRef: MutableRefObject<number>
  setSkillIndex: (updater: (i: number) => number) => void
  selectSkill: (skill: any) => void

  blockCommandsRef: MutableRefObject<MarkdownBlockCommand[]>
  blockCommandIndexRef: MutableRefObject<number>
  setBlockCommandIndex: (updater: (i: number) => number) => void
  setBlockCommands: (cmds: MarkdownBlockCommand[]) => void
  setBlockCommandPosition: (pos: any) => void
  selectBlockCommand: (cmd: MarkdownBlockCommand) => void

  browsingRef: MutableRefObject<boolean>
  navigateRef: MutableRefObject<
    (dir: "up" | "down", current: string) => { text: string; cursor: string } | null
  >

  editorViewRef: RefObject<EditorView | null>
  onChangeRef: MutableRefObject<(value: string) => void>
  isStreamingRef: MutableRefObject<boolean | undefined>
  escStopRef: MutableRefObject<number>
  onStopRef: MutableRefObject<(() => void) | undefined>
  onUndo?: () => void
  handleSendAction: (delivery?: "queue" | "steer") => void
  warningToast: (msg: string) => void
  t: (key: any) => string
}

export const buildAgentInputKeymap = (opts: AgentInputKeymapOptions): Extension => {
  return Prec.highest(
    keymap.of([
      {
        key: "ArrowDown",
        run: (view) => {
          if (opts.pastePanelRef.current) {
            const count = opts.pasteOptionsRef.current.length || 2
            opts.setPasteIndex((i) => (i + 1) % count)
            return true
          }
          if (opts.activeModeRef.current === "undo_confirm") {
            opts.setUndoConfirmIndex((i) => (i + 1) % 2)
            return true
          }
          if (
            opts.activeModeRef.current === "command" &&
            opts.matchedCommandsRef.current.length > 0
          ) {
            opts.setCommandIndex((i) => (i + 1) % opts.matchedCommandsRef.current.length)
            return true
          }
          if (opts.activeModeRef.current === "model" && opts.matchedModelsRef.current.length > 0) {
            opts.setModelIndex((i) => (i + 1) % opts.matchedModelsRef.current.length)
            return true
          }
          if (
            opts.activeModeRef.current === "worktree" &&
            opts.matchedWorktreesRef.current.length > 0
          ) {
            opts.setWorktreeIndex((i) => (i + 1) % opts.matchedWorktreesRef.current.length)
            return true
          }
          if (opts.activeModeRef.current === "file" && opts.mentionItemsRef.current.length > 0) {
            opts.setFileIndex((i) => (i + 1) % opts.mentionItemsRef.current.length)
            return true
          }
          if (opts.activeModeRef.current === "skill" && opts.matchedSkillsRef.current.length > 0) {
            opts.setSkillIndex((i) => (i + 1) % opts.matchedSkillsRef.current.length)
            return true
          }
          if (opts.blockCommandsRef.current.length > 0) {
            opts.setBlockCommandIndex((i) => (i + 1) % opts.blockCommandsRef.current.length)
            return true
          }

          // 提示词历史向下导航
          const doc = view.state.doc.toString()
          const cursor = view.state.selection.main.head
          const lastLineBreak = doc.lastIndexOf("\n")
          const isOnLastLine = lastLineBreak === -1 || cursor > lastLineBreak
          if (opts.browsingRef.current && isOnLastLine) {
            const result = opts.navigateRef.current("down", doc)
            if (result) {
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: result.text },
                selection: { anchor: result.cursor === "start" ? 0 : result.text.length },
              })
              return true
            }
          }
          return false
        },
      },
      {
        key: "ArrowUp",
        run: (view) => {
          if (opts.pastePanelRef.current) {
            const count = opts.pasteOptionsRef.current.length || 2
            opts.setPasteIndex((i) => (i - 1 + count) % count)
            return true
          }
          if (opts.activeModeRef.current === "undo_confirm") {
            opts.setUndoConfirmIndex((i) => (i - 1 + 2) % 2)
            return true
          }
          if (
            opts.activeModeRef.current === "command" &&
            opts.matchedCommandsRef.current.length > 0
          ) {
            opts.setCommandIndex(
              (i) =>
                (i - 1 + opts.matchedCommandsRef.current.length) %
                opts.matchedCommandsRef.current.length,
            )
            return true
          }
          if (opts.activeModeRef.current === "model" && opts.matchedModelsRef.current.length > 0) {
            opts.setModelIndex(
              (i) =>
                (i - 1 + opts.matchedModelsRef.current.length) %
                opts.matchedModelsRef.current.length,
            )
            return true
          }
          if (
            opts.activeModeRef.current === "worktree" &&
            opts.matchedWorktreesRef.current.length > 0
          ) {
            opts.setWorktreeIndex(
              (i) =>
                (i - 1 + opts.matchedWorktreesRef.current.length) %
                opts.matchedWorktreesRef.current.length,
            )
            return true
          }
          if (opts.activeModeRef.current === "file" && opts.mentionItemsRef.current.length > 0) {
            opts.setFileIndex(
              (i) =>
                (i - 1 + opts.mentionItemsRef.current.length) % opts.mentionItemsRef.current.length,
            )
            return true
          }
          if (opts.activeModeRef.current === "skill" && opts.matchedSkillsRef.current.length > 0) {
            opts.setSkillIndex(
              (i) =>
                (i - 1 + opts.matchedSkillsRef.current.length) %
                opts.matchedSkillsRef.current.length,
            )
            return true
          }
          if (opts.blockCommandsRef.current.length > 0) {
            opts.setBlockCommandIndex(
              (i) =>
                (i - 1 + opts.blockCommandsRef.current.length) %
                opts.blockCommandsRef.current.length,
            )
            return true
          }

          // 提示词历史向上导航
          const doc = view.state.doc.toString()
          const cursor = view.state.selection.main.head
          const firstLineBreak = doc.indexOf("\n")
          const isOnFirstLine = firstLineBreak === -1 || cursor <= firstLineBreak
          const isAtLineStart = cursor === 0 || (cursor > 0 && doc[cursor - 1] === "\n")
          const canUp =
            isOnFirstLine && (doc.length === 0 || opts.browsingRef.current || isAtLineStart)
          if (canUp) {
            const result = opts.navigateRef.current("up", doc)
            if (result) {
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: result.text },
                selection: { anchor: result.cursor === "start" ? 0 : result.text.length },
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
          if (opts.pastePanelRef.current) {
            opts.closePastePanel()
            return true
          }
          if (opts.activeModeRef.current) {
            opts.setActiveMode(null)
            return true
          }
          if (opts.blockCommandsRef.current.length > 0) {
            opts.setBlockCommands([])
            opts.setBlockCommandPosition(undefined)
            return true
          }
          const view = opts.editorViewRef.current
          const doc = view?.state.doc.toString() ?? ""
          if (doc.trim().length > 0) {
            view?.dispatch({
              changes: { from: 0, to: doc.length, insert: "" },
              selection: { anchor: 0 },
            })
            opts.onChangeRef.current("")
            return true
          }
          if (opts.isStreamingRef.current) {
            const now = Date.now()
            if (opts.escStopRef.current !== 0 && now - opts.escStopRef.current <= 1000) {
              opts.escStopRef.current = 0
              opts.onStopRef.current?.()
            } else {
              opts.escStopRef.current = now
              opts.warningToast(opts.t("agent.pressEscAgainToStop"))
            }
            return true
          }
          return false
        },
      },
      {
        key: "Enter",
        run: () => {
          if (opts.pastePanelRef.current) {
            const pOpts = opts.pasteOptionsRef.current
            const selected = pOpts[opts.pasteIndexRef.current] ?? pOpts[0]
            return opts.selectPasteReference(selected?.id ?? "reference")
          }
          if (opts.activeModeRef.current === "undo_confirm") {
            const isConfirm = opts.undoConfirmIndexRef.current === 0
            opts.setActiveMode(null)
            if (isConfirm) {
              const view = opts.editorViewRef.current
              if (view) {
                view.dispatch({
                  changes: { from: 0, to: view.state.doc.length, insert: "" },
                })
              }
              opts.onChangeRef.current("")
              opts.onUndo?.()
            }
            return true
          }
          if (opts.activeModeRef.current === "command") {
            const cmd =
              opts.matchedCommandsRef.current[opts.commandIndexRef.current] ??
              opts.matchedCommandsRef.current[0]
            if (cmd) {
              opts.executeCommand(cmd)
              return true
            }
          }
          if (opts.activeModeRef.current === "model") {
            const mod =
              opts.matchedModelsRef.current[opts.modelIndexRef.current] ??
              opts.matchedModelsRef.current[0]
            if (mod) {
              opts.selectModel(mod)
              return true
            }
          }
          if (opts.activeModeRef.current === "worktree") {
            const opt =
              opts.matchedWorktreesRef.current[opts.worktreeIndexRef.current] ??
              opts.matchedWorktreesRef.current[0]
            if (opt) {
              opts.selectWorktree(opt)
              return true
            }
          }
          if (opts.activeModeRef.current === "file") {
            const item =
              opts.mentionItemsRef.current[opts.fileIndexRef.current] ??
              opts.mentionItemsRef.current[0]
            if (item) {
              if (item.kind === "skill") {
                opts.selectSkillFromMention(item.skill)
              } else {
                opts.selectFile(item.file)
              }
              return true
            }
          }
          if (opts.activeModeRef.current === "skill") {
            const skill =
              opts.matchedSkillsRef.current[opts.skillIndexRef.current] ??
              opts.matchedSkillsRef.current[0]
            if (skill) {
              opts.selectSkill(skill)
              return true
            }
          }
          if (opts.blockCommandsRef.current.length > 0) {
            const cmd =
              opts.blockCommandsRef.current[opts.blockCommandIndexRef.current] ??
              opts.blockCommandsRef.current[0]
            if (cmd) {
              opts.selectBlockCommand(cmd)
              return true
            }
          }

          // 默认回车：发送消息
          opts.handleSendAction()
          return true
        },
        shift: (view) => {
          if (opts.isStreamingRef.current) {
            opts.handleSendAction("steer")
          } else {
            const cursor = view.state.selection.main.head
            const line = view.state.doc.lineAt(cursor)
            const indentMatch = line.text.match(/^(\s*)/)
            const indent = indentMatch ? indentMatch[1] : ""
            const insert = `\n${indent}`
            view.dispatch({
              changes: { from: cursor, to: cursor, insert },
              selection: { anchor: cursor + insert.length },
            })
          }
          return true
        },
      },
      {
        key: "Backspace",
        run: (view) => {
          if (opts.activeModeRef.current === "file" || opts.activeModeRef.current === "skill")
            return false
          const cursor = view.state.selection.main
          if (cursor.from !== cursor.to) return false
          const text = view.state.doc.sliceString(0, cursor.from)
          const tokenMatch = /(^|\s)([@$][^\s]+) $/.exec(text)
          if (tokenMatch) {
            const start = cursor.from - tokenMatch[0].length + tokenMatch[1].length
            view.dispatch({
              changes: { from: start, to: cursor.from, insert: "" },
              selection: { anchor: start },
            })
            return true
          }
          return false
        },
      },
      {
        key: "Tab",
        preventDefault: true,
        run: () => true,
      },
    ]),
  )
}
