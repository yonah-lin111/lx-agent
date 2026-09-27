import type { EditorView } from "@codemirror/view"
import type { CollaborationMode, SkillItem } from "@shared/contracts/agent"
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
  AgentHistoryPromptItem,
  AgentInputCommand,
  AgentInputModel,
  AgentInputProjectItem,
  AgentInputSessionItem,
  ClawMentionCandidate,
  SubagentMentionCandidate,
} from "../../AgentInputCommandPanels"
import {
  collapsePlaceholderArgument,
  getArgumentSelectionRange,
  getCommandArgumentText,
  getMentionQuery,
  getSkillMentionQuery,
  HISTORY_PROMPT_COMMAND,
  resolveExportFormat,
} from "../agentMarkdownInputUtils"
import type { AgentInputActiveMode } from "../types"

interface UseAgentInputActionsProps {
  editorViewRef: React.RefObject<EditorView | null>
  valueRef: React.RefObject<string>
  onChangeRef: React.RefObject<(value: string) => void>
  onSendRef: React.RefObject<(options?: { delivery?: "queue" | "steer" }) => void>
  // /btw 发送回调（问题文本；主输入框路由到侧问线）。
  onBtwSendRef?: React.RefObject<((question: string) => void) | undefined>
  onClear?: () => void
  onUndo?: () => void
  onCompact?: () => void
  onModelChange?: (value: string) => void
  onWorktreeSelect?: (path: string) => void
  onProjectSelect?: (projectId: string, projectPath: string) => void
  onCdSelect?: (projectId: string, projectPath: string) => void
  onSessionSelect?: (sessionId: string) => void
  allowProjectChange?: boolean
  // 是否可用 /btw（无 QA 的主会话拦截发送并提示）。
  canUseBtw?: boolean
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
  onBtwSendRef,
  onClear,
  onUndo,
  onCompact,
  onModelChange,
  onWorktreeSelect,
  onProjectSelect,
  onCdSelect,
  onSessionSelect,
  allowProjectChange = true,
  canUseBtw = true,
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

  // 清空编辑器与外部输入状态（命令执行后统一收口）。
  const clearEditor = useCallback((): void => {
    onChangeRef.current("")
    const view = editorViewRef.current
    if (view) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } })
    }
  }, [editorViewRef, onChangeRef])

  // 执行会话导出：命令拦截与 /export 二级面板选项共用。
  const executeExport = useCallback(
    (format: "html" | "markdown" | "jsonl"): void => {
      clearEditor()
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
    },
    [clearEditor, successToast, errorToast, t],
  )

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
        const rawArg = getCommandArgumentText(text, "export").toLowerCase()
        const explicitDash = /^\/export[:\s]*-/.test(text)
        // 显式写了 `-` 却没选格式，或参数无法识别：提示选择，保留输入等待修正。
        const format = rawArg ? resolveExportFormat(rawArg) : explicitDash ? null : "html"
        if (format === null) {
          warningToast(t("agent.exportFormatRequired"))
          return
        }
        executeExport(format)
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
        const rawArg = getCommandArgumentText(text, "cd")
        // `/cd -path` 未编辑占位词时等同空参：走系统目录选择器。
        const targetPath = cleanWorkspacePath(collapsePlaceholderArgument(rawArg, "path"))
        clearEditor()

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
        const rawArg = getCommandArgumentText(text, "copy").toLowerCase()
        const target =
          rawArg === "all" || rawArg === "full" || rawArg === "md" || rawArg === "markdown"
            ? "markdown"
            : "last_assistant"
        clearEditor()
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

      // 拦截 /historyPrompt 相关命令：面板未接管时不允许作为普通消息发送。
      if (text === HISTORY_PROMPT_COMMAND || text.startsWith(`${HISTORY_PROMPT_COMMAND} `)) {
        onChangeRef.current("")
        const view = editorViewRef.current
        if (view) {
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
          })
        }
        warningToast(t("agent.noPromptHistory"))
        return
      }

      // 拦截 /btw 相关命令：路由到侧问线；无 QA 的主会话不允许发送。
      if (text.startsWith("/btw ") || text === "/btw") {
        if (!canUseBtw) {
          warningToast(t("agent.btwNoConversation"))
          return
        }
        // 必填参数缺失（含未编辑的 `-prompt` 占位词）：提示补参后发送，保留输入。
        const question = collapsePlaceholderArgument(getCommandArgumentText(text, "btw"), "prompt")
        if (!question) {
          errorToast(t("agent.btwMissingContent"))
          return
        }
        onBtwSendRef?.current?.(question)
        return
      }

      let delivery = forceDelivery
      if (text.startsWith("/steer ") || text === "/steer") {
        delivery = "steer"
        // 必填参数缺失（含未编辑的 `-prompt` 占位词）：提示补参后发送，保留输入。
        const steerContent = collapsePlaceholderArgument(
          getCommandArgumentText(text, "steer"),
          "prompt",
        )
        if (!steerContent) {
          errorToast(t("agent.steerMissingContent"))
          return
        }
        text = steerContent
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
      onBtwSendRef,
      record,
      onCompact,
      onClear,
      onUndo,
      executeExport,
      clearEditor,
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

      // /export 二级格式面板选项：选中即执行导出。
      if (command.id.startsWith("export:")) {
        executeExport(command.id.slice("export:".length) as "html" | "markdown" | "jsonl")
        return
      }

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
        const insertText = "/steer -prompt"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 6)
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
      } else if (command.id === "btw") {
        const insertText = "/btw -prompt"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 4)
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
        const insertText = "/cd -path"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 3)
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
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
        // 回显 `/export -` 并触发二级格式面板（syncPanels 检测前缀后弹出）。
        const insertText = "/export -"
        onChangeRef.current(insertText)
        view?.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: insertText },
          selection: { anchor: insertText.length },
        })
      } else if (command.id === "copy") {
        const insertText = "/copy -all"
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, 5)
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: insertText },
            selection,
          })
        }
      } else if (command.id === "historyPrompt") {
        const insertText = `${HISTORY_PROMPT_COMMAND} -query`
        onChangeRef.current(insertText)
        if (view) {
          const selection = getArgumentSelectionRange(insertText, HISTORY_PROMPT_COMMAND.length)
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
      executeExport,
      setActiveMode,
      setUndoConfirmIndex,
      updatePanelPosition,
    ],
  )

  // 选中历史提示词：整体替换输入内容并聚焦，等待用户确认发送。
  const selectHistoryPrompt = useCallback(
    (item: AgentHistoryPromptItem): void => {
      const view = editorViewRef.current
      onChangeRef.current(item.text)
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: item.text },
          selection: { anchor: item.text.length },
        })
        view.focus()
      }
      setActiveMode(null)
    },
    [editorViewRef, onChangeRef, setActiveMode],
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

  const selectSubagentMention = useCallback(
    (candidate: SubagentMentionCandidate): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const insert = `@agent:${candidate.name} `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
    },
    [editorViewRef, setActiveMode],
  )

  const selectAgentMode = useCallback(
    (mode: CollaborationMode): void => {
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const insert = `@agentMode:${mode} `
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
    selectHistoryPrompt,
    selectModel,
    selectWorktree,
    selectProject,
    selectSession,
    selectFile,
    selectSkill,
    selectSkillFromMention,
    selectDesign,
    selectClawAgent,
    selectSubagentMention,
    selectAgentMode,
    selectBlockCommand,
  }
}
