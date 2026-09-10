import type { EditorView } from "@codemirror/view"
import type { SkillItem } from "@shared/contracts/agent"
import { cleanWorkspacePath, type ProjectFileEntry } from "@shared/project"
import type React from "react"
import { useCallback, useRef } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import type { FrontDesignItem } from "@/features/agent/hooks/frontDesignStore"
import type { GitWorktreeOption } from "@/features/git"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockTrigger,
} from "@/features/markdown/commands/markdownBlockCommands"
import { projectApi } from "@/features/project/api/projectApi"
import { useProjectItemsVersionStore } from "@/features/project-navigation/projectItemsStore"
import type { TranslationKey } from "@/i18n"
import type {
  AgentInputCommand,
  AgentInputModel,
  AgentInputProjectItem,
  AgentInputSessionItem,
  ClawMentionCandidate,
} from "../../AgentInputCommandPanels"
import {
  getArgumentSelectionRange,
  getMentionQuery,
  getSkillMentionQuery,
} from "../agentMarkdownInputUtils"
import type { AgentInputActiveMode } from "../types"

interface UseAgentInputActionsProps {
  editorViewRef: React.RefObject<EditorView | null>
  valueRef: React.RefObject<string>
  onChangeRef: React.RefObject<(value: string) => void>
  onSendRef: React.RefObject<(options?: { delivery?: "queue" | "steer" }) => void>
  onClear?: () => void
  onUndo?: () => void
  onCompact?: () => void
  onModelChange?: (value: string) => void
  onWorktreeSelect?: (path: string) => void
  onProjectSelect?: (projectId: string, projectPath: string) => void
  onCdSelect?: (projectId: string, projectPath: string) => void
  onSessionSelect?: (sessionId: string) => void
  allowProjectChange?: boolean
  currentSessionId?: string | null
  isOnlyOneTurnLeft?: () => boolean
  setActiveMode: (mode: AgentInputActiveMode) => void
  setUndoConfirmIndex: React.Dispatch<React.SetStateAction<number>>
  updatePanelPosition: () => void
  setBlockCommands: React.Dispatch<React.SetStateAction<MarkdownBlockCommand[]>>
  setBlockCommandPosition: React.Dispatch<React.SetStateAction<React.CSSProperties | undefined>>
  record: (text: string) => void
  reset: () => void
  successToast: (msg: string) => void
  errorToast: (msg: string) => void
  warningToast: (msg: string) => void
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
}

export const useAgentInputActions = ({
  editorViewRef,
  valueRef,
  onChangeRef,
  onSendRef,
  onClear,
  onUndo,
  onCompact,
  onModelChange,
  onWorktreeSelect,
  onProjectSelect,
  onCdSelect,
  onSessionSelect,
  allowProjectChange = true,
  currentSessionId,
  isOnlyOneTurnLeft,
  setActiveMode,
  setUndoConfirmIndex,
  updatePanelPosition,
  setBlockCommands,
  setBlockCommandPosition,
  record,
  reset,
  successToast,
  errorToast,
  warningToast,
  t,
}: UseAgentInputActionsProps) => {
  const isOnlyOneTurnLeftRef = useRef(isOnlyOneTurnLeft)
  isOnlyOneTurnLeftRef.current = isOnlyOneTurnLeft

  const handleSendAction = useCallback(
    (forceDelivery?: "queue" | "steer"): void => {
      reset()
      let text = valueRef.current.trim()
      if (!text) return

      // 拦截 /export 相关命令
      if (
        text === "/export" ||
        text.startsWith("/export ") ||
        text.startsWith("/export:") ||
        text.startsWith("/export-")
      ) {
        const rawArg = text
          .replace(/^\/export[:\s-]*/i, "")
          .replace(/^\[|\]$/g, "")
          .trim()
          .toLowerCase()
        let format: "html" | "markdown" | "jsonl" = "html"
        if (
          rawArg === "md" ||
          rawArg === "markdown" ||
          rawArg.startsWith("md") ||
          rawArg.startsWith("markdown")
        ) {
          format = "markdown"
        } else if (
          rawArg === "json" ||
          rawArg === "jsonl" ||
          rawArg.startsWith("json") ||
          rawArg.startsWith("jsonl")
        ) {
          format = "jsonl"
        } else if (rawArg === "html" || rawArg.startsWith("html") || rawArg === "") {
          format = "html"
        }
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }
        void agentApi
          .exportSession({ format, openAfterExport: true })
          .then((res) => {
            if (res.ok && !res.canceled && res.filePath) {
              successToast(
                t("agent.exportSuccess", {
                  format: format.toUpperCase(),
                  path: res.filePath,
                }),
              )
            } else if (!res.ok) {
              errorToast(res.error || t("agent.exportFailed"))
            }
          })
          .catch((err) => {
            errorToast(err instanceof Error ? err.message : t("agent.exportFailed"))
          })
        return
      }

      // 拦截 /compact 相关命令
      if (
        text === "/compact" ||
        text.startsWith("/compact ") ||
        text.startsWith("/compact:") ||
        text.startsWith("/compact-")
      ) {
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }
        onCompact?.()
        return
      }

      // 拦截 /project 相关命令（当不允许切换项目时）
      if (
        text === "/project" ||
        text.startsWith("/project ") ||
        text.startsWith("/project:") ||
        text.startsWith("/project-")
      ) {
        if (!allowProjectChange) {
          warningToast(t("agent.projectChangeOnlyInNewChat"))
          onChangeRef.current("")
          const view = editorViewRef.current
          if (view) {
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: "" },
            })
          }
          return
        }
      }

      // 拦截 /cd 相关命令
      if (
        text === "/cd" ||
        text.startsWith("/cd ") ||
        text.startsWith("/cd:") ||
        text.startsWith("/cd-")
      ) {
        const rawArg = text.replace(/^\/cd[:\s-]*/i, "")
        const targetPath = cleanWorkspacePath(rawArg)
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }

        const proceedWithTargetPath = (path: string): void => {
          void projectApi
            .findOrCreateByPath(path)
            .then((project) => {
              if (project?.path) {
                onCdSelect?.(project.id, project.path)
                useProjectItemsVersionStore.getState().bump()
              }
            })
            .catch((err) => {
              const msg = err instanceof Error ? err.message : String(err)
              if (msg.includes("PROJECT_PATH_NOT_FOUND")) {
                errorToast(t("agent.pathNotFound"))
              } else {
                errorToast(msg || t("agent.cdFailed"))
              }
            })
        }

        if (!targetPath) {
          void projectApi.selectDirectory().then((selected) => {
            if (selected) {
              proceedWithTargetPath(selected)
            }
          })
          return
        }

        proceedWithTargetPath(targetPath)
        return
      }

      // 拦截 /clear 相关命令
      if (
        text === "/clear" ||
        text.startsWith("/clear ") ||
        text.startsWith("/clear:") ||
        text.startsWith("/clear-")
      ) {
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }
        onClear?.()
        return
      }

      // 拦截 /undo 相关命令
      if (
        text === "/undo" ||
        text.startsWith("/undo ") ||
        text.startsWith("/undo:") ||
        text.startsWith("/undo-")
      ) {
        if (isOnlyOneTurnLeftRef.current?.()) {
          setActiveMode("undo_confirm")
          setUndoConfirmIndex(0)
          updatePanelPosition()
          return
        }
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }
        onUndo?.()
        return
      }

      // 拦截 /copy 相关命令
      if (
        text === "/copy" ||
        text.startsWith("/copy ") ||
        text.startsWith("/copy:") ||
        text.startsWith("/copy-")
      ) {
        const rawArg = text
          .replace(/^\/copy[:\s-]*/i, "")
          .replace(/^\[|\]$/g, "")
          .trim()
          .toLowerCase()
        const target =
          rawArg === "all" || rawArg === "full" || rawArg === "md" || rawArg === "markdown"
            ? "markdown"
            : "last_assistant"
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }
        void agentApi
          .copySession({ target })
          .then((res) => {
            if (res.ok && res.text) {
              void navigator.clipboard.writeText(res.text).then(() => {
                successToast(
                  target === "markdown"
                    ? t("agent.copyMarkdownSuccess")
                    : t("agent.copyReplySuccess"),
                )
              })
            } else if (!res.ok) {
              errorToast(res.error || t("agent.copyFailed"))
            } else {
              warningToast(t("agent.noContentToCopy"))
            }
          })
          .catch((err) => {
            errorToast(err instanceof Error ? err.message : t("agent.copyFailed"))
          })
        return
      }

      let delivery = forceDelivery
      if (text.startsWith("/steer ") || text === "/steer") {
        delivery = "steer"
        text = text.slice(6).trim()
        text = text.replace(/^[\[【]([\s\S]*?)[\]】]$/, "$1").trim()
        if (!text) return
      }

      if (delivery === "steer") {
        onSendRef.current({ delivery })
      } else {
        record(text || valueRef.current)
        onSendRef.current()
      }
    },
    [
      reset,
      valueRef,
      onChangeRef,
      editorViewRef,
      onSendRef,
      record,
      onCompact,
      onClear,
      onUndo,
      setActiveMode,
      setUndoConfirmIndex,
      updatePanelPosition,
      successToast,
      errorToast,
      warningToast,
      t,
      onCdSelect,
    ],
  )

  const executeCommand = useCallback(
    (command: AgentInputCommand): void => {
      setActiveMode(null)
      const view = editorViewRef.current
      if (command.kind === "prompt") {
        const rawName = command.name.startsWith("/") ? command.name : `/${command.name}`
        const hint = command.argumentHint ? ` ${command.argumentHint}` : " "
        const insertText = `${rawName}${hint}`
        onChangeRef.current(insertText)
        if (view) {
          const selection = command.argumentHint
            ? getArgumentSelectionRange(insertText, rawName.length)
            : { anchor: insertText.length }
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
      } else if (command.id === "clear") {
        onChangeRef.current("")
        onClear?.()
      } else if (command.id === "undo") {
        if (isOnlyOneTurnLeftRef.current?.()) {
          setActiveMode("undo_confirm")
          setUndoConfirmIndex(0)
          updatePanelPosition()
          return
        }
        onUndo?.()
      } else if (command.id === "steer") {
        const insertText = "/steer [prompt]"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 6)
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
      } else if (command.id === "model") {
        onChangeRef.current("/model ")
        view?.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "/model " },
          selection: { anchor: 7 },
        })
      } else if (command.id === "gitWorktree") {
        onChangeRef.current("/gitWorktree ")
        view?.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "/gitWorktree " },
          selection: { anchor: 13 },
        })
      } else if (command.id === "project") {
        onChangeRef.current("/project ")
        view?.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "/project " },
          selection: { anchor: 9 },
        })
      } else if (command.id === "cd") {
        onChangeRef.current("/cd ")
        view?.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "/cd " },
          selection: { anchor: 4 },
        })
      } else if (command.id === "session") {
        onChangeRef.current("/session ")
        view?.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: "/session " },
          selection: { anchor: 9 },
        })
      } else if (command.id === "compact") {
        onChangeRef.current("")
        onCompact?.()
      } else if (command.id === "export") {
        const insertText = "/export [html | md | json]"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 7)
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
      } else if (command.id === "copy") {
        const insertText = "/copy [all]"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 5)
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
      }
      view?.focus()
    },
    [
      editorViewRef,
      onChangeRef,
      onClear,
      onUndo,
      onCompact,
      setActiveMode,
      setUndoConfirmIndex,
      updatePanelPosition,
    ],
  )

  const selectModel = useCallback(
    (model: AgentInputModel): void => {
      onModelChange?.(model.id)
      onChangeRef.current("")
      setActiveMode(null)
      editorViewRef.current?.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: "" },
      })
      editorViewRef.current?.focus()
    },
    [editorViewRef, onChangeRef, onModelChange, setActiveMode],
  )

  const selectWorktree = useCallback(
    (option: GitWorktreeOption): void => {
      onWorktreeSelect?.(option.path)
      onChangeRef.current("")
      setActiveMode(null)
      editorViewRef.current?.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: "" },
      })
      editorViewRef.current?.focus()
    },
    [editorViewRef, onChangeRef, onWorktreeSelect, setActiveMode],
  )

  const selectProject = useCallback(
    (project: AgentInputProjectItem): void => {
      onProjectSelect?.(project.id, project.path)
      onChangeRef.current("")
      setActiveMode(null)
      editorViewRef.current?.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: "" },
      })
      editorViewRef.current?.focus()
    },
    [editorViewRef, onChangeRef, onProjectSelect, setActiveMode],
  )

  const selectSession = useCallback(
    (session: AgentInputSessionItem): void => {
      setActiveMode(null)
      onChangeRef.current("")
      editorViewRef.current?.dispatch({
        changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: "" },
      })
      editorViewRef.current?.focus()

      if (session.id === currentSessionId) {
        return
      }

      const existingTab = agentTabStore.findTabBySessionId(session.id)
      if (existingTab) {
        agentTabStore.switchTab(existingTab.id)
      } else {
        onSessionSelect?.(session.id)
      }
    },
    [currentSessionId, editorViewRef, onChangeRef, onSessionSelect, setActiveMode],
  )

  const selectFile = useCallback(
    (file: ProjectFileEntry): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const insert = `@${file.path} `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
    },
    [editorViewRef, setActiveMode],
  )

  const selectSkill = useCallback(
    (skill: SkillItem): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getSkillMentionQuery(text, cursor)
      if (!mention) return
      const insert = `$${skill.name} `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
    },
    [editorViewRef, setActiveMode],
  )

  const selectSkillFromMention = useCallback(
    (skill: SkillItem): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const insert = `$${skill.name} `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
    },
    [editorViewRef, setActiveMode],
  )

  const selectDesign = useCallback(
    (design: FrontDesignItem): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const title = design.title || "Frontend Prototype"
      const insert = `@design:${design.id} (${title}) `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
    },
    [editorViewRef, setActiveMode],
  )

  const selectClawAgent = useCallback(
    (candidate: ClawMentionCandidate): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const insert = `@claw:${candidate.instanceId}/${candidate.agentId} (${candidate.name}) `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
    },
    [editorViewRef, setActiveMode],
  )

  const selectBlockCommand = useCallback(
    (cmd: MarkdownBlockCommand): void => {
      const view = editorViewRef.current
      if (!view) return
      const cursor = view.state.selection.main.head
      const line = view.state.doc.lineAt(cursor)
      const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
      if (!trigger) return

      const insertion = createMarkdownBlockInsertion(cmd.id)
      view.dispatch({
        changes: { from: trigger.from, to: trigger.to, insert: insertion.text },
        selection: {
          anchor: trigger.from + insertion.selectionStart,
          head: trigger.from + insertion.selectionEnd,
        },
      })
      view.focus()
      setBlockCommands([])
      setBlockCommandPosition(undefined)
    },
    [editorViewRef, setBlockCommands, setBlockCommandPosition],
  )

  return {
    handleSendAction,
    executeCommand,
    selectModel,
    selectWorktree,
    selectProject,
    selectSession,
    selectFile,
    selectSkill,
    selectSkillFromMention,
    selectDesign,
    selectClawAgent,
    selectBlockCommand,
  }
}
