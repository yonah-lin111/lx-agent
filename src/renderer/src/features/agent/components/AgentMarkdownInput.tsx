import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands"
import { languages } from "@codemirror/language-data"
import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { EditorState, Prec } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { tags } from "@lezer/highlight"
import type { ProjectFileEntry } from "@shared/project"
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import type { GitWorktreeOption } from "@/features/git"
import { GitWorktreeCommandMenu } from "@/features/git"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/features/markdown/commands/markdownBlockCommands"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import { projectApi } from "@/features/project/api/projectApi"
import { usePromptHistory } from "../hooks/usePromptHistory"
import {
  type AgentInputCommand,
  AgentInputCommandPanel,
  AgentInputFilePanel,
  type AgentInputModel,
  AgentInputModelPanel,
  getAgentPanelPosition,
} from "./AgentInputCommandPanels"

export interface AgentMarkdownInputRef {
  focus: () => void
  setSelectionRange: (start: number, end: number) => void
  getValue: () => string
  setValue: (value: string) => void
}

export interface AgentMarkdownInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  disabled?: boolean
  placeholder?: string
  // 面板定位锚点：整个输入框容器（含 padding/边框），保证面板宽度与输入框一致。
  // 缺省时回退到内部 CodeMirror 容器。
  panelAnchorRef?: React.RefObject<HTMLElement | null>
  projectId?: string
  projectPath?: string
  modelOptions?: { label: string; value?: string; options?: { label: string; value: string }[] }[]
  onModelChange?: (value: string) => void
  worktreeOptions?: GitWorktreeOption[] | null
  onWorktreeSelect?: (path: string) => void
  onClear?: () => void
  onUndo?: () => void
  onCompact?: () => void
}

const INPUT_COMMANDS: AgentInputCommand[] = [
  { id: "clear", name: "/clear", description: "清空当前对话" },
  { id: "undo", name: "/undo", description: "撤销上一轮对话" },
  { id: "model", name: "/model", description: "切换 AI 模型" },
  { id: "gitWorktree", name: "/gitWorktree", description: "切换 git 工作区" },
  { id: "compact", name: "/compact", description: "压缩当前会话上下文" },
]

const isFuzzyMatch = (query: string, keyword: string): boolean => {
  if (!query) return true
  let queryIndex = 0
  for (const character of keyword) {
    if (character === query[queryIndex]) queryIndex += 1
    if (queryIndex === query.length) return true
  }
  return false
}

const getMatchedCommands = (value: string): AgentInputCommand[] => {
  if (!value.startsWith("/") || /\s/.test(value)) return []
  const query = value.slice(1).toLowerCase()
  return INPUT_COMMANDS.filter((command) => {
    const aliases = command.id === "clear" ? ["clear", "new"] : [command.id]
    return aliases.some((alias) => isFuzzyMatch(query, alias))
  })
}

const getMentionQuery = (
  value: string,
  cursor: number,
): { start: number; query: string } | null => {
  const beforeCursor = value.slice(0, cursor)
  const start = beforeCursor.lastIndexOf("@")
  if (start < 0 || (start > 0 && !/\s/.test(beforeCursor[start - 1] ?? ""))) return null
  const query = value.slice(start + 1, cursor)
  if (/[\s\n]/.test(query)) return null
  return { start, query }
}

const agentEditorTheme = EditorView.theme({
  "&": {
    height: "auto",
    minHeight: "44px",
    maxHeight: "124px",
    backgroundColor: "transparent",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "12px",
    fontFamily: "inherit",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    minHeight: "44px",
    maxHeight: "124px",
    padding: "2px 4px",
    caretColor: "#ffffff",
    fontFamily: "inherit",
    lineHeight: "20px",
  },
  ".cm-line": {
    lineHeight: "20px",
    padding: "0",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "inherit",
  },
  ".cm-placeholder": {
    color: "rgba(255, 255, 255, 0.35)",
    fontFamily: "inherit",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "#ffffff",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
})

const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#e9a339", fontWeight: "700" },
  { tag: tags.strong, color: "#fb923c", fontWeight: "700" },
  { tag: tags.emphasis, color: "#f472b6", fontStyle: "italic" },
  { tag: tags.link, color: "#38bdf8", textDecoration: "underline" },
  { tag: tags.url, color: "#38bdf8" },
  { tag: tags.monospace, color: "#38bdf8" },
  { tag: tags.comment, color: "rgba(255, 255, 255, 0.4)" },
])

/**
 * Agent 专用 Markdown 输入框组件，使用 CodeMirror 6 引擎，支持：
 * 1. Markdown 语法高亮与语法扩展
 * 2. Markdown 块命令面板（输入 - / # / > / ``` 等触发）
 * 3. Agent 斜杠命令面板（/clear, /undo, /model, /gitWorktree, /compact）
 * 4. @ 项目文件提及搜索
 * 5. 回车发送（Shift+Enter 换行）与上下键历史记录导航
 */
export const AgentMarkdownInput = React.forwardRef<AgentMarkdownInputRef, AgentMarkdownInputProps>(
  (
    {
      value,
      onChange,
      onSend,
      disabled = false,
      placeholder: placeholderText = "给 LX Agent 发送消息...",
      projectId,
      projectPath,
      modelOptions = [],
      onModelChange,
      worktreeOptions,
      onWorktreeSelect,
      onClear,
      onUndo,
      onCompact,
      panelAnchorRef,
    },
    ref,
  ): React.JSX.Element => {
    const containerRef = useRef<HTMLDivElement>(null)
    const editorViewRef = useRef<EditorView | null>(null)
    const [panelPosition, setPanelPosition] = useState<React.CSSProperties | null>(null)
    // 面板定位锚点：优先使用外部整个输入框容器，缺省回退到内部 CodeMirror 容器。
    const getPanelAnchor = useCallback((): HTMLElement | null => {
      return panelAnchorRef?.current ?? containerRef.current
    }, [panelAnchorRef])

    const [activeMode, setActiveMode] = useState<"command" | "file" | "model" | "worktree" | null>(
      null,
    )
    const [commandIndex, setCommandIndex] = useState(0)
    const [fileIndex, setFileIndex] = useState(0)
    const [modelIndex, setModelIndex] = useState(0)
    const [worktreeIndex, setWorktreeIndex] = useState(0)
    const [files, setFiles] = useState<ProjectFileEntry[]>([])

    // 块级命令状态
    const [blockCommands, setBlockCommands] = useState<MarkdownBlockCommand[]>([])
    const [blockCommandIndex, setBlockCommandIndex] = useState(0)
    const [blockCommandPosition, setBlockCommandPosition] = useState<React.CSSProperties | undefined>(
      undefined,
    )
    const isBlockCommandOpen = blockCommands.length > 0 && !!blockCommandPosition

    const { browsing, record, reset, navigate } = usePromptHistory()

    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onSendRef = useRef(onSend)
    onSendRef.current = onSend
    const valueRef = useRef(value)
    valueRef.current = value

    const activeModeRef = useRef(activeMode)
    activeModeRef.current = activeMode
    const commandIndexRef = useRef(commandIndex)
    commandIndexRef.current = commandIndex
    const fileIndexRef = useRef(fileIndex)
    fileIndexRef.current = fileIndex
    const modelIndexRef = useRef(modelIndex)
    modelIndexRef.current = modelIndex
    const worktreeIndexRef = useRef(worktreeIndex)
    worktreeIndexRef.current = worktreeIndex
    const filesRef = useRef(files)
    filesRef.current = files
    const blockCommandsRef = useRef(blockCommands)
    blockCommandsRef.current = blockCommands
    const blockCommandIndexRef = useRef(blockCommandIndex)
    blockCommandIndexRef.current = blockCommandIndex

    const matchedCommands = getMatchedCommands(value)
    const matchedCommandsRef = useRef(matchedCommands)
    matchedCommandsRef.current = matchedCommands

    const matchedModels = useMemo<AgentInputModel[]>(() => {
      if (!value.startsWith("/model")) return []
      const query = value.slice("/model".length).trim().toLowerCase()
      return modelOptions
        .flatMap((group) => {
          if ("options" in group && group.options) {
            return group.options.map((option) => ({
              id: option.value,
              label: option.label,
              provider: group.label,
            }))
          }
          return [{ id: group.value ?? "", label: group.label, provider: "" }]
        })
        .filter((model) => !query || `${model.label} ${model.provider}`.toLowerCase().includes(query))
    }, [value, modelOptions])
    const matchedModelsRef = useRef(matchedModels)
    matchedModelsRef.current = matchedModels

    const matchedWorktrees = useMemo<GitWorktreeOption[]>(() => {
      if (!worktreeOptions || worktreeOptions.length === 0 || !value.startsWith("/gitWorktree"))
        return []
      const query = value.slice("/gitWorktree".length).trim().toLowerCase()
      return worktreeOptions.filter(
        (option) =>
          !query ||
          option.name.toLowerCase().includes(query) ||
          option.path.toLowerCase().includes(query),
      )
    }, [value, worktreeOptions])
    const matchedWorktreesRef = useRef(matchedWorktrees)
    matchedWorktreesRef.current = matchedWorktrees

    const isCommandMode = activeMode === "command" && matchedCommands.length > 0
    const isFileMode = activeMode === "file" && files.length > 0
    const isModelMode = activeMode === "model" && matchedModels.length > 0
    const isWorktreeMode = activeMode === "worktree" && matchedWorktrees.length > 0

    // 计算底部面板相对于输入框容器的位置
    const updatePanelPosition = useCallback((): void => {
      const anchor = getPanelAnchor()
      if (!anchor) {
        setPanelPosition(null)
        return
      }
      const kind: "command" | "file" | null = isFileMode
        ? "file"
        : isCommandMode || isModelMode || isWorktreeMode
          ? "command"
          : null
      if (!kind) {
        setPanelPosition(null)
        return
      }
      setPanelPosition(getAgentPanelPosition(kind, anchor.getBoundingClientRect()))
    }, [isCommandMode, isFileMode, isModelMode, isWorktreeMode, getPanelAnchor])

    useEffect(() => {
      updatePanelPosition()
    }, [updatePanelPosition])

    // 同步项目文件搜索
    useEffect(() => {
      if (!projectId || !projectPath || activeMode !== "file") {
        setFiles([])
        return
      }
      const view = editorViewRef.current
      const cursor = view?.state.selection.main.head ?? value.length
      const mention = getMentionQuery(value, cursor)
      if (!mention) return
      let current = true
      void projectApi
        .searchFiles(projectId, mention.query)
        .then((results) => {
          if (current) setFiles(results)
        })
        .catch(() => {
          if (current) setFiles([])
        })
      return () => {
        current = false
      }
    }, [value, activeMode, projectId, projectPath])

    // 检测并同步各面板状态
    const syncPanels = useCallback(
      (docText: string, cursor: number, view: EditorView): void => {
        // 1. 斜杠命令相关
        const isModelInput = docText === "/model" || docText.startsWith("/model ")
        if (isModelInput) {
          setActiveMode("model")
          setModelIndex(0)
          setFiles([])
          setBlockCommands([])
          return
        }

        const isWorktreeInput = docText === "/gitWorktree" || docText.startsWith("/gitWorktree ")
        if (isWorktreeInput) {
          setActiveMode("worktree")
          setWorktreeIndex(0)
          setFiles([])
          setBlockCommands([])
          return
        }

        const commands = getMatchedCommands(docText)
        if (commands.length > 0) {
          setActiveMode("command")
          setCommandIndex(0)
          setFiles([])
          setBlockCommands([])
          return
        }

        // 2. @ 文件提及
        const mention = getMentionQuery(docText, cursor)
        if (mention && projectId && projectPath) {
          setActiveMode("file")
          setFileIndex(0)
          setBlockCommands([])
          return
        }
        setActiveMode(null)

        // 3. Markdown 块级命令触发
        const line = view.state.doc.lineAt(cursor)
        const trigger = getMarkdownBlockTrigger(line.text, line.from, cursor)
        const isClosingCodeFence =
          trigger?.kind === "codeBlock" &&
          isInsideMarkdownCodeFence(view.state.doc.sliceString(0, line.from))

        let isContinuousList = false
        if (trigger && line.number > 1) {
          const prevLine = view.state.doc.line(line.number - 1)
          const prevText = prevLine.text
          if (trigger.kind === "unorderedList" && /^(\s*)[-+*](\s|$)/.test(prevText)) {
            isContinuousList = true
          } else if (trigger.kind === "orderedList" && /^(\s*)\d+[.)](\s|$)/.test(prevText)) {
            isContinuousList = true
          } else if (trigger.kind === "quote" && /^(\s*)>(\s|$)/.test(prevText)) {
            isContinuousList = true
          } else if (trigger.kind === "table" && /^(\s*)\|/.test(prevText)) {
            isContinuousList = true
          }
        }

        const matchedBlockCmds =
          trigger && !isClosingCodeFence && !isContinuousList
            ? getMarkdownBlockCommands(trigger.kind)
            : []

        if (matchedBlockCmds.length > 0 && trigger) {
          // 组件主逻辑在 updateListener 中执行（DOM 已更新，可读布局）；
          // coordsAtPos 失败时（极端场景/无布局）fallback 到容器定位。
          const measurePos = trigger.kind === "codeBlock" && cursor > line.from ? cursor - 1 : cursor
          let position: React.CSSProperties | undefined
          try {
            const coords = view.coordsAtPos(measurePos)
            if (coords) {
              const panelWidth = 320
              const left = Math.min(Math.max(coords.left, 8), Math.max(window.innerWidth - panelWidth - 8, 8))
              position =
                window.innerHeight - coords.bottom < 240
                  ? { left, top: "auto", bottom: window.innerHeight - coords.top + 6 }
                  : { left, top: coords.bottom + 6, bottom: "auto" }
            }
          } catch {
            position = undefined
          }
          if (!position) {
            const anchor = getPanelAnchor()
            if (anchor) {
              position = getAgentPanelPosition("command", anchor.getBoundingClientRect())
            }
          }
          if (position) {
            setBlockCommands(matchedBlockCmds)
            setBlockCommandPosition(position)
          }
          return
        }
        setBlockCommands([])
        setBlockCommandPosition(undefined)
      },
      [projectId, projectPath, getPanelAnchor],
    )
    // CodeMirror keymap/ViewPlugin 在首次渲染时创建并捕获闭包，而 projectId/projectPath 为异步加载，
    // 必须通过 ref 读取最新 syncPanels，否则 @ / 斜杠命令等面板检测永远拿不到项目上下文。
    const syncPanelsRef = useRef(syncPanels)
    syncPanelsRef.current = syncPanels

    // 发送处理
    const handleSendAction = useCallback((): void => {
      reset()
      const text = valueRef.current
      if (!text.trim()) return
      record(text)
      onSendRef.current()
    }, [record, reset])

    const executeCommand = useCallback(
      (command: AgentInputCommand): void => {
        setActiveMode(null)
        const view = editorViewRef.current
        if (command.id === "clear") {
          onChangeRef.current("")
          onClear?.()
        } else if (command.id === "undo") {
          onUndo?.()
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
        } else {
          onChangeRef.current("")
          onCompact?.()
        }
        view?.focus()
      },
      [onClear, onUndo, onCompact],
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
      [onModelChange],
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
      [onWorktreeSelect],
    )

    const selectFile = useCallback((file: ProjectFileEntry): void => {
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
    }, [])

    const selectBlockCommand = useCallback((cmd: MarkdownBlockCommand): void => {
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
    }, [])

    // 暴露 ref
    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          editorViewRef.current?.focus()
        },
        setSelectionRange: (start: number, end: number) => {
          const view = editorViewRef.current
          if (!view) return
          const safeStart = Math.max(0, Math.min(start, view.state.doc.length))
          const safeEnd = Math.max(0, Math.min(end, view.state.doc.length))
          view.dispatch({ selection: { anchor: safeStart, head: safeEnd } })
        },
        getValue: () => valueRef.current,
        setValue: (newVal: string) => {
          const view = editorViewRef.current
          if (!view) return
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: newVal },
            selection: { anchor: newVal.length },
          })
        },
      }),
      [],
    )

    // 初始化 CodeMirror
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const state = EditorState.create({
        doc: value,
        extensions: [
          history(),
          markdown({
            codeLanguages: languages,
            extensions: [GFM, { remove: ["SetextHeading"] }],
          }),
          syntaxHighlighting(markdownHighlightStyle),
          agentEditorTheme,
          EditorView.lineWrapping,
          indentOnInput(),
          bracketMatching(),
          Prec.highest(
            keymap.of([
              {
                key: "ArrowDown",
                run: (view) => {
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
                  if (activeModeRef.current === "file" && filesRef.current.length > 0) {
                    setFileIndex((i) => (i + 1) % filesRef.current.length)
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
                  if (browsing && isOnLastLine) {
                    const result = navigate("down", doc)
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
                  if (activeModeRef.current === "command" && matchedCommandsRef.current.length > 0) {
                    setCommandIndex(
                      (i) => (i - 1 + matchedCommandsRef.current.length) % matchedCommandsRef.current.length,
                    )
                    return true
                  }
                  if (activeModeRef.current === "model" && matchedModelsRef.current.length > 0) {
                    setModelIndex(
                      (i) => (i - 1 + matchedModelsRef.current.length) % matchedModelsRef.current.length,
                    )
                    return true
                  }
                  if (activeModeRef.current === "worktree" && matchedWorktreesRef.current.length > 0) {
                    setWorktreeIndex(
                      (i) =>
                        (i - 1 + matchedWorktreesRef.current.length) % matchedWorktreesRef.current.length,
                    )
                    return true
                  }
                  if (activeModeRef.current === "file" && filesRef.current.length > 0) {
                    setFileIndex((i) => (i - 1 + filesRef.current.length) % filesRef.current.length)
                    return true
                  }
                  if (blockCommandsRef.current.length > 0) {
                    setBlockCommandIndex(
                      (i) => (i - 1 + blockCommandsRef.current.length) % blockCommandsRef.current.length,
                    )
                    return true
                  }

                  // 提示词历史向上导航
                  const doc = view.state.doc.toString()
                  const cursor = view.state.selection.main.head
                  const firstLineBreak = doc.indexOf("\n")
                  const isOnFirstLine = firstLineBreak === -1 || cursor <= firstLineBreak
                  const isAtLineStart = cursor === 0 || (cursor > 0 && doc[cursor - 1] === "\n")
                  const canUp = isOnFirstLine && (doc.length === 0 || browsing || isAtLineStart)
                  if (canUp) {
                    const result = navigate("up", doc)
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
                  if (activeModeRef.current) {
                    setActiveMode(null)
                    return true
                  }
                  if (blockCommandsRef.current.length > 0) {
                    setBlockCommands([])
                    setBlockCommandPosition(undefined)
                    return true
                  }
                  return false
                },
              },
              {
                key: "Enter",
                run: () => {
                  if (activeModeRef.current === "command") {
                    const cmd =
                      matchedCommandsRef.current[commandIndexRef.current] ??
                      matchedCommandsRef.current[0]
                    if (cmd) {
                      executeCommand(cmd)
                      return true
                    }
                  }
                  if (activeModeRef.current === "model") {
                    const mod =
                      matchedModelsRef.current[modelIndexRef.current] ?? matchedModelsRef.current[0]
                    if (mod) {
                      selectModel(mod)
                      return true
                    }
                  }
                  if (activeModeRef.current === "worktree") {
                    const opt =
                      matchedWorktreesRef.current[worktreeIndexRef.current] ??
                      matchedWorktreesRef.current[0]
                    if (opt) {
                      selectWorktree(opt)
                      return true
                    }
                  }
                  if (activeModeRef.current === "file") {
                    const f = filesRef.current[fileIndexRef.current] ?? filesRef.current[0]
                    if (f) {
                      selectFile(f)
                      return true
                    }
                  }
                  if (blockCommandsRef.current.length > 0) {
                    const cmd =
                      blockCommandsRef.current[blockCommandIndexRef.current] ??
                      blockCommandsRef.current[0]
                    if (cmd) {
                      selectBlockCommand(cmd)
                      return true
                    }
                  }

                  // 默认回车：发送消息
                  handleSendAction()
                  return true
                },
                shift: (view) => {
                  // Shift+Enter 换行并保持缩进
                  const cursor = view.state.selection.main.head
                  const line = view.state.doc.lineAt(cursor)
                  const indentMatch = line.text.match(/^(\s*)/)
                  const indent = indentMatch ? indentMatch[1] : ""
                  const insert = `\n${indent}`
                  view.dispatch({
                    changes: { from: cursor, to: cursor, insert },
                    selection: { anchor: cursor + insert.length },
                  })
                  return true
                },
              },
              {
                key: "Backspace",
                run: (view) => {
                  if (activeModeRef.current === "file") return false
                  const cursor = view.state.selection.main
                  if (cursor.from !== cursor.to) return false
                  const text = view.state.doc.sliceString(0, cursor.from)
                  const tokenMatch = /(^|\s)(@[^\s]+) $/.exec(text)
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
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholder(placeholderText),
          // 用 updateListener 而非 viewPlugin：后者在 DOM 更新前调用，读取布局
          // （coordsAtPos）会抛 "Reading the editor layout isn't allowed during an update"。
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const newDoc = update.state.doc.toString()
              onChangeRef.current(newDoc)
            }
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head
              const docText = update.state.doc.toString()
              syncPanelsRef.current(docText, cursor, update.view)
            }
          }),
          EditorView.domEventHandlers({
            focus: (_event, view) => {
              const cursor = view.state.selection.main.head
              const docText = view.state.doc.toString()
              syncPanelsRef.current(docText, cursor, view)
            },
          }),
        ],
      })

      const view = new EditorView({
        state,
        parent: container,
      })
      editorViewRef.current = view

      return () => {
        view.destroy()
        editorViewRef.current = null
      }
    }, [])

    // 外部 value 变动同步回 CodeMirror
    useEffect(() => {
      const view = editorViewRef.current
      if (!view) return
      const currentDoc = view.state.doc.toString()
      if (currentDoc !== value) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
          selection: { anchor: Math.min(view.state.selection.main.head, value.length) },
        })
      }
    }, [value])

    return (
      <div className="relative min-w-0 flex-1">
        {/* 面板集合 */}
        <AgentInputCommandPanel
          isOpen={isCommandMode}
          position={panelPosition}
          commands={matchedCommands}
          activeIndex={commandIndex}
        />
        <AgentInputModelPanel
          isOpen={isModelMode}
          position={panelPosition}
          models={matchedModels}
          activeIndex={modelIndex}
        />
        <GitWorktreeCommandMenu
          visible={isWorktreeMode}
          position={panelPosition ?? undefined}
          options={matchedWorktrees}
          activeIndex={worktreeIndex}
        />
        <AgentInputFilePanel
          isOpen={isFileMode}
          position={panelPosition}
          files={files}
          activeIndex={fileIndex}
        />
        <MarkdownBlockCommandMenu
          commands={blockCommands}
          activeIndex={blockCommandIndex}
          position={blockCommandPosition}
          visible={isBlockCommandOpen}
        />

        {/* CodeMirror 编辑器容器 */}
        <div
          ref={containerRef}
          className={`min-h-[44px] max-h-[124px] w-full overflow-y-auto ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        />
      </div>
    )
  },
)

AgentMarkdownInput.displayName = "AgentMarkdownInput"
