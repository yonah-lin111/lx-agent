import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands"
import { languages } from "@codemirror/language-data"
import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { EditorState, Prec } from "@codemirror/state"
import {
  EditorView,
  keymap,
  placeholder,
} from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import type { ProjectFileEntry } from "@shared/project"
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import type { GitWorktreeOption } from "@/features/git"
import { GitWorktreeCommandMenu } from "@/features/git"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import {
  createMarkdownBlockInsertion,
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/features/markdown/commands/markdownBlockCommands"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import { MarkdownPasteCommandMenu } from "@/features/markdown/components/MarkdownPasteCommandMenu"
import {
  markdownHighlightStyle,
  markdownMarkerHighlight,
} from "@/features/markdown/extensions/markdownEditorExtensions"
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
  onSend: (options?: { delivery?: "queue" | "steer" }) => void
  disabled?: boolean
  isExpanded?: boolean
  isStreaming?: boolean
  onStop?: () => void
  placeholder?: string
  // 面板定位锚点：整个输入框容器（含 padding/边框），保证面板宽度与输入框一致。
  // 缺省时回退到内部 CodeMirror 容器。
  panelAnchorRef?: React.RefObject<HTMLElement | null>
  projectId?: string
  projectPath?: string
  currentPath?: string
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
  { id: "steer", name: "/steer", description: "即时插话（引导运行中 Agent 转向）" },
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

const getClipboardFiles = (
  event: ClipboardEvent,
): { path: string; type: "folder" | "file" | "image" }[] => {
  const clipboardData = event.clipboardData
  if (!clipboardData) return []

  const files = Array.from(clipboardData.files)
  const entries = Array.from(clipboardData.items).filter(
    (item) => item.kind === "file",
  )
  const clipboardFiles = files.flatMap((file, index) => {
    try {
      const path = window.api.getPathForFile(file)
      if (!path) return []
      const entry = (
        entries[index] as
          | (DataTransferItem & { webkitGetAsEntry?: () => { isDirectory: boolean } | null })
          | undefined
      )?.webkitGetAsEntry?.()
      const isImage = file.type.startsWith("image/") || /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path)
      return [{ path, type: entry?.isDirectory ? "folder" : isImage ? "image" : "file" }]
    } catch {
      return []
    }
  })
  if (clipboardFiles.length > 0) return clipboardFiles

  const plainText = clipboardData.getData("text/plain").trim()
  if (plainText.startsWith("/")) {
    return [{
      path: plainText,
      type: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(plainText) ? "image" : "file",
    }]
  }

  const fileUri = clipboardData
    .getData("text/uri-list")
    .split(/\r?\n/)
    .find((value) => value.trim() && !value.trim().startsWith("#"))
  if (!fileUri?.startsWith("file://")) return []

  try {
    const path = decodeURIComponent(new URL(fileUri.trim()).pathname)
    return [{
      path,
      type: /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(path) ? "image" : "file",
    }]
  } catch {
    return []
  }
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
    height: "var(--agent-input-height, auto)",
    minHeight: "var(--agent-input-height, 44px)",
    maxHeight: "244px",
    backgroundColor: "transparent",
    color: "rgba(255, 255, 255, 0.9)",
    fontSize: "12px",
    fontFamily: "inherit",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-content": {
    minHeight: "var(--agent-input-height, 44px)",
    maxHeight: "244px",
    padding: "2px 4px",
    caretColor: "#ffffff",
    fontFamily: "inherit",
    lineHeight: "20px",
  },
  ".cm-line": {
    lineHeight: "20px",
    padding: "0",
    position: "relative",
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
  ".cm-md-heading-marker, .cm-md-heading-marker *": {
    color: "#e9a339 !important",
    fontWeight: "700",
  },
  ".cm-md-strong-marker, .cm-md-strong-marker *": {
    color: "#fb923c !important",
    fontWeight: "700",
  },
  ".cm-md-emphasis-marker, .cm-md-emphasis-marker *": {
    color: "#f472b6 !important",
    fontWeight: "700",
  },
  ".cm-md-table-marker, .cm-md-table-marker *": {
    color: "#38bdf8 !important",
    fontWeight: "700",
  },
  ".cm-md-task-marker, .cm-md-task-marker *": {
    color: "#a3e635 !important",
    fontWeight: "700",
  },
  ".cm-md-unordered-list-marker, .cm-md-unordered-list-marker *": {
    color: "#2dd4bf !important",
    fontWeight: "700",
  },
  ".cm-md-ordered-list-marker, .cm-md-ordered-list-marker *": {
    color: "#c084fc !important",
    fontWeight: "700",
  },
  ".cm-md-code-fence-marker, .cm-md-code-fence-marker *": {
    color: "#e879f9 !important",
    fontWeight: "700",
  },
  ".cm-md-code-fence-language, .cm-md-code-fence-language *": {
    color: "#38bdf8 !important",
    fontWeight: "700",
    backgroundColor: "rgba(56, 189, 248, 0.12) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
  },
  ".cm-md-code-fence-start-line": {
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
    borderRight: "1px solid rgba(255, 255, 255, 0.08)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.015)",
    paddingLeft: "6px",
    paddingTop: "2px",
    paddingBottom: "2px",
  },
  ".cm-md-code-fence-middle-line": {
    borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
    borderRight: "1px solid rgba(255, 255, 255, 0.08)",
    backgroundColor: "rgba(255, 255, 255, 0.015)",
    paddingLeft: "6px",
  },
  ".cm-md-code-fence-end-line": {
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
    borderRight: "1px solid rgba(255, 255, 255, 0.08)",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.015)",
    paddingLeft: "6px",
    paddingBottom: "2px",
  },
  ".cm-md-code-fence-hidden-line": {
    display: "none !important",
  },
  ".cm-md-code-fence-start-line .cm-monospace, .cm-md-code-fence-middle-line .cm-monospace, .cm-md-code-fence-end-line .cm-monospace": {
    color: "inherit !important",
    backgroundColor: "transparent !important",
    padding: "0 !important",
    borderRadius: "0 !important",
  },
  ".cm-md-code-fence-start-line span:not(.cm-md-code-fence-language):not(.markdown-file-mention-node), .cm-md-code-fence-middle-line span:not(.markdown-file-mention-node), .cm-md-code-fence-end-line span:not(.markdown-file-mention-node)": {
    backgroundColor: "transparent !important",
    padding: "0 !important",
    borderRadius: "0 !important",
  },
  ".cm-md-inline-code-marker, .cm-md-inline-code-marker *": {
    color: "#fb7185 !important",
    fontWeight: "700",
  },
  ".cm-md-quote-marker, .cm-md-quote-marker *": {
    color: "#a5b4fc !important",
    fontWeight: "700",
  },
  ".cm-md-link-marker, .cm-md-link-marker *": {
    color: "#86efac !important",
    fontWeight: "700",
  },
  ".cm-md-strike-marker, .cm-md-strike-marker *": {
    color: "#fda4af !important",
    fontWeight: "700",
  },
  ".cm-md-separator-marker, .cm-md-separator-marker *": {
    color: "#fde047 !important",
    fontWeight: "700",
  },
  ".cm-md-bracket-content-marker, .cm-md-bracket-content-marker *": {
    textDecoration: "underline",
    textDecorationColor: "rgba(255, 255, 255, 0.4)",
  },
  ".cm-md-template-marker, .cm-md-template-marker *": {
    color: "#818cf8 !important",
    fontWeight: "700",
  },
  ".cm-md-template-command, .cm-md-template-command *": {
    color: "#c4b5fd !important",
    fontWeight: "700",
    backgroundColor: "rgba(196, 181, 253, 0.12) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
  },
  ".cm-md-template-command-addTemplate, .cm-md-template-command-addTemplate *": {
    color: "#34d399 !important",
    backgroundColor: "rgba(52, 211, 153, 0.15) !important",
  },
  ".cm-md-template-command-bugTemplate, .cm-md-template-command-bugTemplate *": {
    color: "#fb7185 !important",
    backgroundColor: "rgba(251, 113, 133, 0.15) !important",
  },
  ".cm-md-template-command-refactorTemplate, .cm-md-template-command-refactorTemplate *": {
    color: "#c084fc !important",
    backgroundColor: "rgba(192, 132, 252, 0.15) !important",
  },
  ".cm-md-template-command-commonTemplate, .cm-md-template-command-commonTemplate *": {
    color: "#38bdf8 !important",
    backgroundColor: "rgba(56, 189, 248, 0.15) !important",
  },
  ".cm-md-template-title, .cm-md-template-title *": {
    color: "#fde68a !important",
    backgroundColor: "rgba(253, 230, 138, 0.18) !important",
    textDecoration: "underline",
    textDecorationColor: "rgba(253, 230, 138, 0.6)",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
  },
  ".cm-md-template-done, .cm-md-template-done *": {
    color: "#34d399 !important",
    backgroundColor: "rgba(52, 211, 153, 0.15) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
  },
  ".cm-md-template-in-progress, .cm-md-template-in-progress *": {
    color: "#fbbf24 !important",
    backgroundColor: "rgba(251, 191, 36, 0.15) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
  },
  ".cm-md-template-id, .cm-md-template-id *": {
    color: "#f0abfc !important",
    backgroundColor: "rgba(240, 171, 252, 0.14) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
    fontWeight: "600 !important",
  },
  ".cm-md-template-wt, .cm-md-template-wt *": {
    color: "#22d3ee !important",
    backgroundColor: "rgba(34, 211, 238, 0.14) !important",
    padding: "1px 6px !important",
    borderRadius: "3px !important",
    fontWeight: "600 !important",
  },
  ".cm-md-template-start-line": {
    borderTop: "1px solid rgba(129, 140, 248, 0.2)",
    borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
    borderRight: "1px solid rgba(129, 140, 248, 0.2)",
    borderBottom: "1px solid rgba(129, 140, 248, 0.2)",
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
    backgroundColor: "rgba(129, 140, 248, 0.03)",
    paddingLeft: "6px",
    paddingRight: "96px",
    boxSizing: "border-box",
    paddingTop: "2px",
    paddingBottom: "2px",
  },
  ".cm-md-template-middle-line": {
    borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
    borderRight: "1px solid rgba(129, 140, 248, 0.2)",
    backgroundColor: "rgba(129, 140, 248, 0.03)",
    paddingLeft: "6px",
  },
  ".cm-md-template-end-line": {
    borderBottom: "1px solid rgba(129, 140, 248, 0.2)",
    borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
    borderRight: "1px solid rgba(129, 140, 248, 0.2)",
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
    backgroundColor: "rgba(129, 140, 248, 0.03)",
    paddingLeft: "6px",
    paddingBottom: "2px",
  },
  ".cm-md-template-comment-line": {
    borderLeft: "1px solid rgba(129, 140, 248, 0.2)",
    borderRight: "1px solid rgba(129, 140, 248, 0.2)",
    backgroundColor: "rgba(129, 140, 248, 0.03)",
    paddingLeft: "6px",
  },
  ".cm-md-template-comment-line, .cm-md-template-comment-line *": {
    color: "#6b7280 !important",
    fontStyle: "italic !important",
  },
  ".cm-md-template-line-in-progress": {
    borderColor: "rgba(251, 191, 36, 0.35) !important",
  },
  ".cm-md-template-line-done": {
    borderColor: "rgba(52, 211, 153, 0.35) !important",
  },
  ".cm-md-template-hidden-line": {
    display: "none !important",
  },
  ".cm-md-file-mention, .cm-md-file-mention *": {
    color: "#eab308 !important",
    fontWeight: "500",
    textDecoration: "underline",
    textDecorationColor: "rgba(234, 179, 8, 0.4)",
  },
  ".cm-md-referenced-file-mention, .cm-md-referenced-file-mention *": {
    color: "#c4b5fd !important",
    fontWeight: "500",
    textDecoration: "underline",
    textDecorationColor: "rgba(196, 181, 253, 0.4)",
  },
  ".cm-md-reference-project, .cm-md-reference-project *": {
    color: "#c4b5fd !important",
    fontWeight: "500",
  },
  ".cm-md-reference-folder, .cm-md-reference-folder *": {
    color: "#d97706 !important",
    fontWeight: "500",
  },
  ".cm-md-reference-file, .cm-md-reference-file *": {
    color: "#7dd3fc !important",
    fontWeight: "500",
  },
  ".cm-md-reference-image, .cm-md-reference-image *": {
    color: "#f9a8d4 !important",
    fontWeight: "500",
  },
  ".cm-md-reference-common, .cm-md-reference-common *": {
    color: "#cbd5e1 !important",
    fontWeight: "500",
  },
})

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
      isExpanded = false,
      isStreaming = false,
      onStop,
      placeholder: placeholderText = "给 LX Agent 发送消息...",
      projectId,
      projectPath,
      currentPath,
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
    const { warning: warningToast } = useLxToast()
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
    const [pastePanel, setPastePanel] = useState<{
      from: number
      insertion: string
      referenceInsertion: string
      originalText: string
      paths: { path: string; type: "folder" | "file" | "image" }[]
      position: React.CSSProperties
    } | null>(null)
    const [pasteIndex, setPasteIndex] = useState(0)
    // 块级命令状态
    const [blockCommands, setBlockCommands] = useState<MarkdownBlockCommand[]>([])
    const [blockCommandIndex, setBlockCommandIndex] = useState(0)
    const [blockCommandPosition, setBlockCommandPosition] = useState<React.CSSProperties | undefined>(
      undefined,
    )
    const isBlockCommandOpen = blockCommands.length > 0 && !!blockCommandPosition

    const { browsing, record, reset, navigate } = usePromptHistory()
    const pastePanelRef = useRef(pastePanel)
    pastePanelRef.current = pastePanel
    const pasteIndexRef = useRef(pasteIndex)
    pasteIndexRef.current = pasteIndex

    const closePastePanel = (restore = true): void => {
      const view = editorViewRef.current
      const panel = pastePanelRef.current
      if (restore && view && panel) {
        view.dispatch({
          changes: {
            from: panel.from,
            to: panel.from + panel.insertion.length,
            insert: panel.originalText,
          },
          selection: { anchor: panel.from + panel.originalText.length },
        })
        view.focus()
      }
      pastePanelRef.current = null
      pasteIndexRef.current = 0
      setPastePanel(null)
      setPasteIndex(0)
    }

    const selectPasteReference = (mode: "reference" | "path"): boolean => {
      const view = editorViewRef.current
      const panel = pastePanelRef.current
      if (!view || !panel) return false

      const text = mode === "reference" ? panel.referenceInsertion : panel.insertion
      view.dispatch({
        changes: {
          from: panel.from,
          to: panel.from + panel.insertion.length,
          insert: text,
        },
        selection: { anchor: panel.from + text.length },
        userEvent: "input.paste",
      })
      view.focus()
      closePastePanel(false)
      return true
    }

    useEffect(() => {
      const handlePointerDown = (event: PointerEvent): void => {
        if (!pastePanelRef.current) return
        const anchor = getPanelAnchor()
        if (anchor?.contains(event.target as Node)) return
        closePastePanel()
      }
      document.addEventListener("pointerdown", handlePointerDown)
      return () => document.removeEventListener("pointerdown", handlePointerDown)
    }, [getPanelAnchor])

    // keymap 在首次渲染创建并捕获闭包，而 history 为异步加载，必须通过 ref 读取最新浏览状态。
    const browsingRef = useRef(browsing)
    browsingRef.current = browsing
    const navigateRef = useRef(navigate)
    navigateRef.current = navigate

    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onSendRef = useRef(onSend)
    onSendRef.current = onSend
    const isStreamingRef = useRef(isStreaming)
    isStreamingRef.current = isStreaming
    const onStopRef = useRef(onStop)
    onStopRef.current = onStop
    const valueRef = useRef(value)
    valueRef.current = value
    // Esc 停止生成的连按计时（间隔 ≤1s 视为双击）；单按仅 toast 提示，不打断。
    const escStopRef = useRef(0)

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

    // 同步项目/目录文件搜索
    useEffect(() => {
      if (activeMode !== "file") {
        setFiles([])
        return
      }
      const view = editorViewRef.current
      const cursor = view?.state.selection.main.head ?? value.length
      const mention = getMentionQuery(value, cursor)
      if (!mention) return
      let current = true

      const fetchPromise = projectId
        ? projectApi.searchFiles(projectId, mention.query)
        : currentPath
          ? projectApi.searchDirectoryFiles(currentPath, mention.query)
          : Promise.resolve([])

      void fetchPromise
        .then((results) => {
          if (current) setFiles(results)
        })
        .catch(() => {
          if (current) setFiles([])
        })
      return () => {
        current = false
      }
    }, [value, activeMode, projectId, currentPath])

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
        if (mention && (projectId || currentPath)) {
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
      [projectId, projectPath, currentPath, getPanelAnchor],
    )
    // CodeMirror keymap/ViewPlugin 在首次渲染时创建并捕获闭包，而 projectId/projectPath 为异步加载，
    // 必须通过 ref 读取最新 syncPanels，否则 @ / 斜杠命令等面板检测永远拿不到项目上下文。
    const syncPanelsRef = useRef(syncPanels)
    syncPanelsRef.current = syncPanels

    // 发送处理
    const handleSendAction = useCallback(
      (forceDelivery?: "queue" | "steer"): void => {
        reset()
        let text = valueRef.current.trim()
        if (!text) return

        let delivery = forceDelivery
        if (text.startsWith("/steer ") || text === "/steer") {
          delivery = "steer"
          text = text.slice(6).trim()
          if (!text) return
        }

        if (delivery === "steer") {
          onSendRef.current({ delivery })
        } else {
          record(text || valueRef.current)
          onSendRef.current()
        }
      },
      [record, reset],
    )

    const executeCommand = useCallback(
      (command: AgentInputCommand): void => {
        setActiveMode(null)
        const view = editorViewRef.current
        if (command.id === "clear") {
          onChangeRef.current("")
          onClear?.()
        } else if (command.id === "undo") {
          onUndo?.()
        } else if (command.id === "steer") {
          onChangeRef.current("/steer ")
          view?.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "/steer " },
            selection: { anchor: 7 },
          })
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
          markdownMarkerHighlight(),
          EditorView.lineWrapping,
          indentOnInput(),
          bracketMatching(),
          Prec.highest(
            keymap.of([
              {
                key: "ArrowDown",
                run: (view) => {
                  if (pastePanelRef.current) {
                    setPasteIndex((i) => (i + 1) % 2)
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
                    setPasteIndex((i) => (i - 1 + 2) % 2)
                    return true
                  }
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
                  const canUp = isOnFirstLine && (doc.length === 0 || browsingRef.current || isAtLineStart)
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
                    closePastePanel()
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
                      warningToast("再次按 Esc 可停止生成")
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
                    return selectPasteReference(
                      pasteIndexRef.current === 0 ? "reference" : "path",
                    )
                  }
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
                  // 流式生成中 Shift+Enter 触发 Steer 即时插话；非流式中作为普通换行并保持缩进。
                  if (isStreamingRef.current) {
                    handleSendAction("steer")
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
            paste: (event, view) => {
              const files = getClipboardFiles(event)
              if (files.length === 0) return false

              event.preventDefault()
              const { from, to } = view.state.selection.main
              const prevChar = from > 0 ? view.state.doc.sliceString(from - 1, from) : ""
              const leadingSpace = prevChar && !/\s/.test(prevChar) ? " " : ""
              const referenceInsertion = `${leadingSpace}${files
                .map(({ path, type }) => createMarkdownReference(type, path))
                .join(" ")} `
              const insertion = `${leadingSpace}${files.map(({ path }) => path).join(" ")} `
              const anchor = getPanelAnchor()
              const position = anchor
                ? getAgentPanelPosition("command", anchor.getBoundingClientRect())
                : { left: 8, top: 8 }

              const panel = {
                from,
                insertion,
                referenceInsertion,
                originalText: view.state.doc.sliceString(from, to),
                paths: files,
                position,
              }
              pastePanelRef.current = panel
              pasteIndexRef.current = 0
              setPastePanel(panel)
              setPasteIndex(0)
              view.dispatch({
                changes: { from, to, insert: insertion },
                selection: { anchor: from + insertion.length },
                userEvent: "input.paste",
              })
              return true
            },
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

    // 外部 value 变动同步回 CodeMirror（如建议问题回显），光标定位到末尾，保证 @ 等触发检测正确。
    useEffect(() => {
      const view = editorViewRef.current
      if (!view) return
      const currentDoc = view.state.doc.toString()
      if (currentDoc !== value) {
        view.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: value },
          selection: { anchor: value.length },
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
        <MarkdownPasteCommandMenu
          activeIndex={pasteIndex}
          position={pastePanel?.position}
          visible={Boolean(pastePanel)}
        />

        {/* CodeMirror 编辑器容器：内容自适应（默认最大 12 行），扩大时固定最大 12 行高度（244px）。 */}
        <div
          ref={containerRef}
          style={
            isExpanded
              ? ({ "--agent-input-height": "244px" } as React.CSSProperties)
              : undefined
          }
          className={`${
            isExpanded ? "h-[244px]" : "min-h-[44px]"
          } max-h-[244px] w-full overflow-y-auto ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        />
      </div>
    )
  },
)

AgentMarkdownInput.displayName = "AgentMarkdownInput"
