import { type Extension, Prec } from "@codemirror/state"
import { EditorView, keymap } from "@codemirror/view"
import type React from "react"
import { useMemo, useRef } from "react"
import type { GitWorktreeOption } from "@/features/git"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import type { MarkdownPasteReferenceOption } from "@/features/markdown/components/MarkdownPasteCommandMenu"
import type { TranslationKey } from "@/i18n"
import type {
  AgentInputCommand,
  AgentInputModel,
  AgentInputProjectItem,
  AgentInputSessionItem,
  AgentMentionItem,
} from "../../AgentInputCommandPanels"
import { getDesignMentionDeletionRange } from "../agentMarkdownInputUtils"
import type { AgentInputActiveMode, AgentInputPastePanelState } from "../types"

interface UseAgentInputKeymapProps {
  editorViewRef: React.RefObject<EditorView | null>
  // Paste
  pastePanelRef: React.RefObject<AgentInputPastePanelState | null>
  pasteOptionsRef: React.RefObject<MarkdownPasteReferenceOption[]>
  pasteIndexRef: React.RefObject<number>
  setPasteIndex: React.Dispatch<React.SetStateAction<number>>
  closePastePanel: (restore?: boolean) => void
  selectPasteReference: (mode: "reference" | "path" | "upload") => boolean
  // Panels & modes
  activeModeRef: React.RefObject<AgentInputActiveMode>
  setActiveMode: (mode: AgentInputActiveMode) => void
  undoConfirmIndexRef: React.RefObject<number>
  setUndoConfirmIndex: React.Dispatch<React.SetStateAction<number>>
  commandIndexRef: React.RefObject<number>
  setCommandIndex: React.Dispatch<React.SetStateAction<number>>
  matchedCommandsRef: React.RefObject<AgentInputCommand[]>
  modelIndexRef: React.RefObject<number>
  setModelIndex: React.Dispatch<React.SetStateAction<number>>
  matchedModelsRef: React.RefObject<AgentInputModel[]>
  worktreeIndexRef: React.RefObject<number>
  setWorktreeIndex: React.Dispatch<React.SetStateAction<number>>
  matchedWorktreesRef: React.RefObject<GitWorktreeOption[]>
  projectIndexRef: React.RefObject<number>
  setProjectIndex: React.Dispatch<React.SetStateAction<number>>
  matchedProjectsRef: React.RefObject<AgentInputProjectItem[]>
  sessionIndexRef: React.RefObject<number>
  setSessionIndex: React.Dispatch<React.SetStateAction<number>>
  matchedSessionsRef: React.RefObject<AgentInputSessionItem[]>
  fileIndexRef: React.RefObject<number>
  setFileIndex: React.Dispatch<React.SetStateAction<number>>
  mentionItemsRef: React.RefObject<AgentMentionItem[]>
  skillIndexRef: React.RefObject<number>
  setSkillIndex: React.Dispatch<React.SetStateAction<number>>
  matchedSkillsRef: React.RefObject<{ name: string; displayName?: string }[]>
  blockCommandsRef: React.RefObject<MarkdownBlockCommand[]>
  blockCommandIndexRef: React.RefObject<number>
  setBlockCommandIndex: React.Dispatch<React.SetStateAction<number>>
  setBlockCommands: React.Dispatch<React.SetStateAction<MarkdownBlockCommand[]>>
  setBlockCommandPosition: React.Dispatch<React.SetStateAction<React.CSSProperties | undefined>>
  // History
  browsingRef: React.RefObject<boolean>
  navigateRef: React.RefObject<
    (dir: "up" | "down", currentText: string) => { text: string; cursor: "start" | "end" } | null
  >
  // Actions
  handleSendAction: (forceDelivery?: "queue" | "steer") => void
  executeCommand: (command: AgentInputCommand) => void
  selectModel: (model: AgentInputModel) => void
  selectWorktree: (option: GitWorktreeOption) => void
  selectProject: (project: AgentInputProjectItem) => void
  selectSession: (session: AgentInputSessionItem) => void
  selectMentionItem: (item: AgentMentionItem) => void
  selectSkill: (skill: any) => void
  selectUndoConfirm: (index: number) => void
  selectBlockCommand: (cmd: MarkdownBlockCommand) => void
  onChangeRef: React.RefObject<(value: string) => void>
  // Streaming & Stop
  isStreamingRef: React.RefObject<boolean>
  escStopRef: React.RefObject<number>
  onStopRef: React.RefObject<(() => void) | undefined>
  warningToast: (msg: string) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const useAgentInputKeymap = ({
  editorViewRef,
  pastePanelRef,
  pasteOptionsRef,
  pasteIndexRef,
  setPasteIndex,
  closePastePanel,
  selectPasteReference,
  activeModeRef,
  setActiveMode,
  undoConfirmIndexRef,
  setUndoConfirmIndex,
  commandIndexRef,
  setCommandIndex,
  matchedCommandsRef,
  modelIndexRef,
  setModelIndex,
  matchedModelsRef,
  worktreeIndexRef,
  setWorktreeIndex,
  matchedWorktreesRef,
  projectIndexRef,
  setProjectIndex,
  matchedProjectsRef,
  sessionIndexRef,
  setSessionIndex,
  matchedSessionsRef,
  fileIndexRef,
  setFileIndex,
  mentionItemsRef,
  skillIndexRef,
  setSkillIndex,
  matchedSkillsRef,
  blockCommandsRef,
  blockCommandIndexRef,
  setBlockCommandIndex,
  setBlockCommands,
  setBlockCommandPosition,
  browsingRef,
  navigateRef,
  handleSendAction,
  executeCommand,
  selectModel,
  selectWorktree,
  selectProject,
  selectSession,
  selectMentionItem,
  selectSkill,
  selectUndoConfirm,
  selectBlockCommand,
  onChangeRef,
  isStreamingRef,
  escStopRef,
  onStopRef,
  warningToast,
  t,
}: UseAgentInputKeymapProps): Extension => {
  const closePastePanelRef = useRef(closePastePanel)
  closePastePanelRef.current = closePastePanel
  const selectPasteReferenceRef = useRef(selectPasteReference)
  selectPasteReferenceRef.current = selectPasteReference
  const handleSendActionRef = useRef(handleSendAction)
  handleSendActionRef.current = handleSendAction
  const executeCommandRef = useRef(executeCommand)
  executeCommandRef.current = executeCommand
  const selectModelRef = useRef(selectModel)
  selectModelRef.current = selectModel
  const selectWorktreeRef = useRef(selectWorktree)
  selectWorktreeRef.current = selectWorktree
  const selectProjectRef = useRef(selectProject)
  selectProjectRef.current = selectProject
  const selectSessionRef = useRef(selectSession)
  selectSessionRef.current = selectSession
  const selectMentionItemRef = useRef(selectMentionItem)
  selectMentionItemRef.current = selectMentionItem
  const selectSkillRef = useRef(selectSkill)
  selectSkillRef.current = selectSkill
  const selectUndoConfirmRef = useRef(selectUndoConfirm)
  selectUndoConfirmRef.current = selectUndoConfirm
  const selectBlockCommandRef = useRef(selectBlockCommand)
  selectBlockCommandRef.current = selectBlockCommand
  const warningToastRef = useRef(warningToast)
  warningToastRef.current = warningToast
  const tRef = useRef(t)
  tRef.current = t

  return useMemo(
    () =>
      Prec.highest(
        keymap.of([
          {
            key: "ArrowDown",
            run: (view) => {
              if (pastePanelRef.current) {
                const count = pasteOptionsRef.current.length || 2
                setPasteIndex((i) => (i + 1) % count)
                return true
              }
              if (activeModeRef.current === "undo_confirm") {
                setUndoConfirmIndex((i) => (i + 1) % 2)
                return true
              }
              if (activeModeRef.current === "command" && matchedCommandsRef.current.length > 0) {
                setCommandIndex((i) => (i + 1) % matchedCommandsRef.current.length)
                return true
              }
              if (activeModeRef.current === "model" && matchedModelsRef.current.length > 0) {
                setModelIndex((i) => (i + 1) % matchedModelsRef.current.length)
                return true
              }
              if (activeModeRef.current === "worktree" && matchedWorktreesRef.current.length > 0) {
                setWorktreeIndex((i) => (i + 1) % matchedWorktreesRef.current.length)
                return true
              }
              if (activeModeRef.current === "project" && matchedProjectsRef.current.length > 0) {
                setProjectIndex((i) => (i + 1) % matchedProjectsRef.current.length)
                return true
              }
              if (activeModeRef.current === "session" && matchedSessionsRef.current.length > 0) {
                setSessionIndex((i) => (i + 1) % matchedSessionsRef.current.length)
                return true
              }
              if (activeModeRef.current === "file" && mentionItemsRef.current.length > 0) {
                setFileIndex((i) => (i + 1) % mentionItemsRef.current.length)
                return true
              }
              if (activeModeRef.current === "skill" && matchedSkillsRef.current.length > 0) {
                setSkillIndex((i) => (i + 1) % matchedSkillsRef.current.length)
                return true
              }
              if (blockCommandsRef.current.length > 0) {
                setBlockCommandIndex((i) => (i + 1) % blockCommandsRef.current.length)
                return true
              }

              // 提示词历史向下导航
              const doc = view.state.doc.toString()
              const cursor = view.state.selection.main.head
              const lastLineBreak = doc.lastIndexOf("\n")
              const isOnLastLine = lastLineBreak === -1 || cursor > lastLineBreak
              if (browsingRef.current && isOnLastLine) {
                const result = navigateRef.current("down", doc)
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
              if (pastePanelRef.current) {
                const count = pasteOptionsRef.current.length || 2
                setPasteIndex((i) => (i - 1 + count) % count)
                return true
              }
              if (activeModeRef.current === "undo_confirm") {
                setUndoConfirmIndex((i) => (i - 1 + 2) % 2)
                return true
              }
              if (activeModeRef.current === "command" && matchedCommandsRef.current.length > 0) {
                setCommandIndex(
                  (i) =>
                    (i - 1 + matchedCommandsRef.current.length) % matchedCommandsRef.current.length,
                )
                return true
              }
              if (activeModeRef.current === "model" && matchedModelsRef.current.length > 0) {
                setModelIndex(
                  (i) =>
                    (i - 1 + matchedModelsRef.current.length) % matchedModelsRef.current.length,
                )
                return true
              }
              if (activeModeRef.current === "worktree" && matchedWorktreesRef.current.length > 0) {
                setWorktreeIndex(
                  (i) =>
                    (i - 1 + matchedWorktreesRef.current.length) %
                    matchedWorktreesRef.current.length,
                )
                return true
              }
              if (activeModeRef.current === "project" && matchedProjectsRef.current.length > 0) {
                setProjectIndex(
                  (i) =>
                    (i - 1 + matchedProjectsRef.current.length) % matchedProjectsRef.current.length,
                )
                return true
              }
              if (activeModeRef.current === "session" && matchedSessionsRef.current.length > 0) {
                setSessionIndex(
                  (i) =>
                    (i - 1 + matchedSessionsRef.current.length) % matchedSessionsRef.current.length,
                )
                return true
              }
              if (activeModeRef.current === "file" && mentionItemsRef.current.length > 0) {
                setFileIndex(
                  (i) => (i - 1 + mentionItemsRef.current.length) % mentionItemsRef.current.length,
                )
                return true
              }
              if (activeModeRef.current === "skill" && matchedSkillsRef.current.length > 0) {
                setSkillIndex(
                  (i) =>
                    (i - 1 + matchedSkillsRef.current.length) % matchedSkillsRef.current.length,
                )
                return true
              }
              if (blockCommandsRef.current.length > 0) {
                setBlockCommandIndex(
                  (i) =>
                    (i - 1 + blockCommandsRef.current.length) % blockCommandsRef.current.length,
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
                isOnFirstLine && (doc.length === 0 || browsingRef.current || isAtLineStart)
              if (canUp) {
                const result = navigateRef.current("up", doc)
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
              if (pastePanelRef.current) {
                closePastePanelRef.current()
                return true
              }
              // ① 补全/提及/命令面板激活态：Esc 关闭面板。
              if (activeModeRef.current) {
                setActiveMode(null)
                return true
              }
              if (blockCommandsRef.current.length > 0) {
                setBlockCommands([])
                setBlockCommandPosition(undefined)
                return true
              }
              // ② 若有草稿文本：Esc 清空草稿。
              const view = editorViewRef.current
              const doc = view?.state.doc.toString() ?? ""
              if (doc.trim().length > 0) {
                view?.dispatch({
                  changes: { from: 0, to: doc.length, insert: "" },
                  selection: { anchor: 0 },
                })
                onChangeRef.current("")
                return true
              }
              // ③ 输入为空且正在生成：双击 Esc 才触发 onStop；单按仅 toast 提示。
              if (isStreamingRef.current) {
                const now = Date.now()
                if (escStopRef.current !== 0 && now - escStopRef.current <= 1000) {
                  escStopRef.current = 0
                  onStopRef.current?.()
                } else {
                  escStopRef.current = now
                  warningToastRef.current(tRef.current("agent.pressEscAgainToStop"))
                }
                return true
              }
              return false
            },
          },
          {
            key: "Enter",
            run: () => {
              if (pastePanelRef.current) {
                const opts = pasteOptionsRef.current
                const selected = opts[pasteIndexRef.current] ?? opts[0]
                return selectPasteReferenceRef.current(selected?.id ?? "reference")
              }
              if (activeModeRef.current === "undo_confirm") {
                selectUndoConfirmRef.current(undoConfirmIndexRef.current)
                return true
              }
              if (activeModeRef.current === "command") {
                const cmd =
                  matchedCommandsRef.current[commandIndexRef.current] ??
                  matchedCommandsRef.current[0]
                if (cmd) {
                  executeCommandRef.current(cmd)
                  return true
                }
              }
              if (activeModeRef.current === "model") {
                const mod =
                  matchedModelsRef.current[modelIndexRef.current] ?? matchedModelsRef.current[0]
                if (mod) {
                  selectModelRef.current(mod)
                  return true
                }
              }
              if (activeModeRef.current === "worktree") {
                const opt =
                  matchedWorktreesRef.current[worktreeIndexRef.current] ??
                  matchedWorktreesRef.current[0]
                if (opt) {
                  selectWorktreeRef.current(opt)
                  return true
                }
              }
              if (activeModeRef.current === "project") {
                const project =
                  matchedProjectsRef.current[projectIndexRef.current] ??
                  matchedProjectsRef.current[0]
                if (project) {
                  selectProjectRef.current(project)
                  return true
                }
              }
              if (activeModeRef.current === "session") {
                const session =
                  matchedSessionsRef.current[sessionIndexRef.current] ??
                  matchedSessionsRef.current[0]
                if (session) {
                  selectSessionRef.current(session)
                  return true
                }
              }
              if (activeModeRef.current === "file") {
                const item =
                  mentionItemsRef.current[fileIndexRef.current] ?? mentionItemsRef.current[0]
                if (item) {
                  selectMentionItemRef.current(item)
                  return true
                }
              }
              if (activeModeRef.current === "skill") {
                const skill =
                  matchedSkillsRef.current[skillIndexRef.current] ?? matchedSkillsRef.current[0]
                if (skill) {
                  selectSkillRef.current(skill)
                  return true
                }
              }
              if (blockCommandsRef.current.length > 0) {
                const cmd =
                  blockCommandsRef.current[blockCommandIndexRef.current] ??
                  blockCommandsRef.current[0]
                if (cmd) {
                  selectBlockCommandRef.current(cmd)
                  return true
                }
              }

              // 默认回车：发送消息
              handleSendActionRef.current()
              return true
            },
            shift: (view) => {
              if (isStreamingRef.current) {
                handleSendActionRef.current("steer")
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
              if (activeModeRef.current === "file" || activeModeRef.current === "skill")
                return false
              const cursor = view.state.selection.main
              if (cursor.from !== cursor.to) return false

              // 优先匹配 Design 模式提及的快速整块删除
              const docText = view.state.doc.toString()
              const designRange = getDesignMentionDeletionRange(docText, cursor.from)
              if (designRange) {
                view.dispatch({
                  changes: { from: designRange.from, to: designRange.to, insert: "" },
                  selection: { anchor: designRange.from },
                })
                return true
              }

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
      ),
    [
      editorViewRef,
      pastePanelRef,
      pasteOptionsRef,
      pasteIndexRef,
      setPasteIndex,
      activeModeRef,
      setActiveMode,
      undoConfirmIndexRef,
      setUndoConfirmIndex,
      commandIndexRef,
      setCommandIndex,
      matchedCommandsRef,
      modelIndexRef,
      setModelIndex,
      matchedModelsRef,
      worktreeIndexRef,
      setWorktreeIndex,
      matchedWorktreesRef,
      projectIndexRef,
      setProjectIndex,
      matchedProjectsRef,
      sessionIndexRef,
      setSessionIndex,
      matchedSessionsRef,
      fileIndexRef,
      setFileIndex,
      mentionItemsRef,
      skillIndexRef,
      setSkillIndex,
      matchedSkillsRef,
      blockCommandsRef,
      blockCommandIndexRef,
      setBlockCommandIndex,
      setBlockCommands,
      setBlockCommandPosition,
      browsingRef,
      navigateRef,
      onChangeRef,
      isStreamingRef,
      escStopRef,
      onStopRef,
    ],
  )
}
