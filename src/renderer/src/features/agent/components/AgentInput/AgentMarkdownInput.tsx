import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import type { PromptTemplateItem, SkillItem } from "@shared/contracts/agent"
import type { ProjectFileEntry } from "@shared/project"
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { usePromptHistory } from "@/features/agent/hooks/usePromptHistory"
import type { GitWorktreeOption } from "@/features/git"
import { GitWorktreeCommandMenu } from "@/features/git"
import type { MarkdownBlockCommand } from "@/features/markdown/commands/markdownBlockCommands"
import {
  getMarkdownBlockCommands,
  getMarkdownBlockTrigger,
  isInsideMarkdownCodeFence,
} from "@/features/markdown/commands/markdownBlockCommands"
import { createMarkdownReference } from "@/features/markdown/commands/markdownReferenceCommands"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import {
  buildPasteReferenceOptions,
  MarkdownPasteCommandMenu,
} from "@/features/markdown/components/MarkdownPasteCommandMenu"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markdownEditorExtensions"
import { projectApi } from "@/features/project/api/projectApi"
import { settingsApi, subscribeSettingsChanged } from "@/features/settings"
import { useTranslation } from "@/i18n"
import { getClipboardFilesAsync } from "@/lib/clipboard"
import {
  AgentInputCommandPanel,
  AgentInputFilePanel,
  type AgentInputModel,
  AgentInputModelPanel,
  type AgentMentionItem,
  AgentSkillMentionPanel,
  AgentUndoConfirmPanel,
  getAgentPanelPosition,
} from "./AgentInputCommandPanels"
import type { AgentInputFile } from "./AgentInputFiles"
import { agentEditorTheme, agentHighlightStyle } from "./agentEditorTheme"
import {
  getMatchedCommands,
  getMentionQuery,
  getSkillMentionQuery,
  isFuzzyMatch,
} from "./agentInputUtils"
import { useAgentInputActions } from "./hooks/useAgentInputActions"
import { buildAgentInputKeymap } from "./hooks/useAgentInputKeymap"
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
  panelAnchorRef?: React.RefObject<HTMLElement | null>
  projectId?: string
  projectPath?: string
  currentPath?: string
  modelOptions?: { label: string; value?: string; options?: { label: string; value: string }[] }[]
  onModelChange?: (value: string) => void
  worktreeOptions?: GitWorktreeOption[] | null
  worktreeName?: string
  onWorktreeSelect?: (path: string) => void
  onClear?: () => void
  onUndo?: () => void
  isOnlyOneTurnLeft?: () => boolean
  onCompact?: () => void
  onAddFiles?: (files: AgentInputFile[]) => void
}

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
      worktreeName,
      onWorktreeSelect,
      onClear,
      onUndo,
      isOnlyOneTurnLeft,
      onCompact,
      onAddFiles,
      panelAnchorRef,
    },
    ref,
  ): React.JSX.Element => {
    const containerRef = useRef<HTMLDivElement>(null)
    const editorViewRef = useRef<EditorView | null>(null)
    const { warning: warningToast, success: successToast, error: errorToast } = useLxAgentToast()
    const { t } = useTranslation()
    const onAddFilesRef = useRef(onAddFiles)
    onAddFilesRef.current = onAddFiles
    const [panelPosition, setPanelPosition] = useState<React.CSSProperties | null>(null)
    // 面板定位锚点：优先使用外部整个输入框容器，缺省回退到内部 CodeMirror 容器。
    const getPanelAnchor = useCallback((): HTMLElement | null => {
      return panelAnchorRef?.current ?? containerRef.current
    }, [panelAnchorRef])

    const isOnlyOneTurnLeftRef = useRef(isOnlyOneTurnLeft)
    isOnlyOneTurnLeftRef.current = isOnlyOneTurnLeft

    const [activeMode, setActiveMode] = useState<
      "command" | "file" | "model" | "worktree" | "undo_confirm" | "skill" | null
    >(null)
    const [undoConfirmIndex, setUndoConfirmIndex] = useState(0)
    const undoConfirmIndexRef = useRef(undoConfirmIndex)
    undoConfirmIndexRef.current = undoConfirmIndex
    const [commandIndex, setCommandIndex] = useState(0)
    const [fileIndex, setFileIndex] = useState(0)
    const [modelIndex, setModelIndex] = useState(0)
    const [worktreeIndex, setWorktreeIndex] = useState(0)
    const [skillIndex, setSkillIndex] = useState(0)
    const skillIndexRef = useRef(skillIndex)
    skillIndexRef.current = skillIndex
    const [files, setFiles] = useState<ProjectFileEntry[]>([])
    const [skills, setSkills] = useState<SkillItem[]>([])
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
    const [blockCommandPosition, setBlockCommandPosition] = useState<
      React.CSSProperties | undefined
    >(undefined)
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

    const selectPasteReference = (mode: "reference" | "path" | "upload"): boolean => {
      const view = editorViewRef.current
      const panel = pastePanelRef.current
      if (!view || !panel) return false

      if (mode === "upload") {
        const uploadablePaths = panel.paths.filter((p) => p.type !== "folder")
        if (uploadablePaths.length > 0 && onAddFilesRef.current) {
          const filesToAdd: AgentInputFile[] = uploadablePaths.map((item, index) => {
            const normalizedPath = item.path.replace(/[\\/]+$/, "")
            const name = normalizedPath.split(/[\\/]/).pop() || item.path
            const ext = name.split(".").pop()?.toLowerCase() || ""
            return {
              id: `f-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
              name,
              path: item.path,
              type: item.type === "image" ? "image" : "text",
              extension: ext.toUpperCase(),
            }
          })
          onAddFilesRef.current(filesToAdd)
        }
        // 恢复原有文本，不插入路径
        closePastePanel(true)
        return true
      }

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

    const [promptTemplates, setPromptTemplates] = useState<PromptTemplateItem[]>([])
    const promptTemplatesRef = useRef(promptTemplates)
    promptTemplatesRef.current = promptTemplates

    useEffect(() => {
      let active = true
      agentApi
        .listPromptTemplates(projectPath)
        .then((templates) => {
          if (active) setPromptTemplates(templates)
        })
        .catch(() => {
          if (active) setPromptTemplates([])
        })
      return () => {
        active = false
      }
    }, [projectPath])

    const pasteOptions = useMemo(() => {
      if (!pastePanel) return []
      return buildPasteReferenceOptions(pastePanel.paths, t, true)
    }, [pastePanel, t])
    const pasteOptionsRef = useRef(pasteOptions)
    pasteOptionsRef.current = pasteOptions

    const matchedCommands = useMemo(
      () => getMatchedCommands(value, promptTemplates, t),
      [value, promptTemplates, t],
    )
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
        .filter(
          (model) => !query || `${model.label} ${model.provider}`.toLowerCase().includes(query),
        )
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

    useEffect(() => {
      let active = true
      const fetchSkills = () => {
        const getSettings =
          typeof window !== "undefined" && typeof (window as any).api?.settings?.getSkillSettings === "function"
            ? settingsApi.getSkillSettings()
            : Promise.resolve({ disabled: [] as string[] })
        void Promise.all([agentApi.listSkills(currentPath), getSettings])
          .then(([data, config]) => {
            if (!active) return
            const disabledSet = new Set(config?.disabled || [])
            setSkills(data.filter((s) => !disabledSet.has(s.name)))
          })
          .catch(() => {
            if (active) setSkills([])
          })
      }
      fetchSkills()
      const unsubscribe = subscribeSettingsChanged("skills", fetchSkills)
      return () => {
        active = false
        unsubscribe()
      }
    }, [currentPath])

    const matchedSkills = useMemo(() => {
      if (activeMode !== "skill") return []
      const view = editorViewRef.current
      const cursor = view?.state.selection.main.head ?? value.length
      const mention = getSkillMentionQuery(value, cursor)
      if (!mention) return []
      const q = mention.query.toLowerCase()
      if (!q) return skills
      return skills.filter(
        (s) =>
          isFuzzyMatch(q, s.name.toLowerCase()) ||
          (s.displayName && isFuzzyMatch(q, s.displayName.toLowerCase())) ||
          (s.shortDescription && isFuzzyMatch(q, s.shortDescription.toLowerCase())) ||
          isFuzzyMatch(q, s.description.toLowerCase()),
      )
    }, [activeMode, value, skills])
    const matchedSkillsRef = useRef(matchedSkills)
    matchedSkillsRef.current = matchedSkills

    const matchedMentionSkills = useMemo(() => {
      if (activeMode !== "file") return []
      const view = editorViewRef.current
      const cursor = view?.state.selection.main.head ?? value.length
      const mention = getMentionQuery(value, cursor)
      if (!mention) return []
      const q = mention.query.toLowerCase()
      if (!q) return skills
      return skills.filter(
        (s) =>
          isFuzzyMatch(q, s.name.toLowerCase()) ||
          (s.displayName && isFuzzyMatch(q, s.displayName.toLowerCase())) ||
          (s.shortDescription && isFuzzyMatch(q, s.shortDescription.toLowerCase())) ||
          isFuzzyMatch(q, s.description.toLowerCase()),
      )
    }, [activeMode, value, skills])

    const mentionItems = useMemo<AgentMentionItem[]>(() => {
      if (activeMode !== "file") return []
      const skillItems: AgentMentionItem[] = matchedMentionSkills.map((skill) => ({
        kind: "skill",
        skill,
      }))
      const fileItems: AgentMentionItem[] = files.map((file) => ({
        kind: "file",
        file,
      }))
      return [...skillItems, ...fileItems]
    }, [activeMode, matchedMentionSkills, files])

    const mentionItemsRef = useRef(mentionItems)
    mentionItemsRef.current = mentionItems

    const isCommandMode = activeMode === "command" && matchedCommands.length > 0
    const isFileMode = activeMode === "file" && mentionItems.length > 0
    const isModelMode = activeMode === "model" && matchedModels.length > 0
    const isWorktreeMode = activeMode === "worktree" && matchedWorktrees.length > 0
    const isSkillMode = activeMode === "skill" && matchedSkills.length > 0
    const isUndoConfirmMode = activeMode === "undo_confirm"

    // 计算底部面板相对于输入框容器的位置
    const updatePanelPosition = useCallback((): void => {
      const anchor = getPanelAnchor()
      if (!anchor) {
        setPanelPosition(null)
        return
      }
      const kind: "command" | "file" | null = isFileMode
        ? "file"
        : isCommandMode || isModelMode || isWorktreeMode || isUndoConfirmMode || isSkillMode
          ? "command"
          : null
      if (!kind) {
        setPanelPosition(null)
        return
      }
      setPanelPosition(getAgentPanelPosition(kind, anchor.getBoundingClientRect()))
    }, [
      isCommandMode,
      isFileMode,
      isModelMode,
      isWorktreeMode,
      isSkillMode,
      isUndoConfirmMode,
      getPanelAnchor,
    ])

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

        const commands = getMatchedCommands(docText, promptTemplatesRef.current, t)
        if (commands.length > 0) {
          setActiveMode("command")
          setCommandIndex(0)
          setFiles([])
          setBlockCommands([])
          return
        }

        // 2. $ Skill 提及
        const skillMention = getSkillMentionQuery(docText, cursor)
        if (skillMention) {
          setActiveMode("skill")
          setSkillIndex(0)
          setFiles([])
          setBlockCommands([])
          return
        }

        // 3. @ 文件与 Skill 综合提及
        const mention = getMentionQuery(docText, cursor)
        if (mention && (projectId || currentPath || skills.length > 0)) {
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
          const measurePos =
            trigger.kind === "codeBlock" && cursor > line.from ? cursor - 1 : cursor
          let position: React.CSSProperties | undefined
          try {
            const coords = view.coordsAtPos(measurePos)
            if (coords) {
              const panelWidth = 320
              const left = Math.min(
                Math.max(coords.left, 8),
                Math.max(window.innerWidth - panelWidth - 8, 8),
              )
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

    const {
      handleSendAction,
      executeCommand,
      selectModel,
      selectWorktree,
      selectFile,
      selectSkill,
      selectSkillFromMention,
      selectBlockCommand,
    } = useAgentInputActions({
      editorViewRef,
      valueRef,
      onChangeRef,
      onSendRef,
      isOnlyOneTurnLeftRef,
      setActiveMode,
      setUndoConfirmIndex,
      updatePanelPosition,
      setBlockCommands,
      setBlockCommandPosition,
      reset,
      record,
      onClear,
      onUndo,
      onCompact,
      onModelChange,
      onWorktreeSelect,
      toast: { warning: warningToast, success: successToast, error: errorToast } as any,
      t,
    })

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
          syntaxHighlighting(agentHighlightStyle),
          agentEditorTheme,
          markdownMarkerHighlight(),
          EditorView.lineWrapping,
          indentOnInput(),
          bracketMatching(),
          buildAgentInputKeymap({
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
            matchedCommandsRef,
            commandIndexRef,
            setCommandIndex,
            executeCommand,
            matchedModelsRef,
            modelIndexRef,
            setModelIndex,
            selectModel,
            matchedWorktreesRef,
            worktreeIndexRef,
            setWorktreeIndex,
            selectWorktree,
            mentionItemsRef,
            fileIndexRef,
            setFileIndex,
            selectFile,
            selectSkillFromMention,
            matchedSkillsRef,
            skillIndexRef,
            setSkillIndex,
            selectSkill,
            blockCommandsRef,
            blockCommandIndexRef,
            setBlockCommandIndex,
            setBlockCommands,
            setBlockCommandPosition,
            selectBlockCommand,
            browsingRef,
            navigateRef,
            editorViewRef,
            onChangeRef,
            isStreamingRef,
            escStopRef,
            onStopRef,
            onUndo,
            handleSendAction,
            warningToast,
            t,
          }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholder(placeholderText),
          // 用 updateListener 而非 viewPlugin：后者在 DOM 更新前调用，读取布局
          // （coordsAtPos）会抛 "Reading the editor layout isn't allowed during an update"。
          EditorView.updateListener.of((update) => {
            if (pastePanelRef.current) {
              const panel = pastePanelRef.current
              const currentDoc = update.state.doc.toString()
              const insertedText = currentDoc.slice(panel.from, panel.from + panel.insertion.length)
              const cursor = update.state.selection.main.head
              const isCursorInRange =
                cursor >= panel.from && cursor <= panel.from + panel.insertion.length
              if (insertedText !== panel.insertion || !isCursorInRange) {
                pastePanelRef.current = null
                pasteIndexRef.current = 0
                setPastePanel(null)
                setPasteIndex(0)
              }
            }
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
            keydown: (event) => {
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault()
                return true
              }
              return false
            },
            paste: (event, view) => {
              const clipboardData = event.clipboardData
              const hasItems =
                clipboardData &&
                (clipboardData.files.length > 0 ||
                  Array.from(clipboardData.items).some((i) => i.kind === "file") ||
                  clipboardData.getData("text/plain").trim().startsWith("/") ||
                  clipboardData.getData("text/uri-list").includes("file://"))

              if (!hasItems) return false

              event.preventDefault()
              void getClipboardFilesAsync(event).then((files) => {
                if (files.length === 0) return
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
                view.focus()
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
      <div className="agent-markdown-input-wrapper relative min-w-0 flex-1">
        {/* 面板集合 */}
        <AgentInputCommandPanel
          isOpen={isCommandMode}
          position={panelPosition}
          commands={matchedCommands}
          activeIndex={commandIndex}
        />
        <AgentUndoConfirmPanel
          isOpen={isUndoConfirmMode}
          position={panelPosition}
          activeIndex={undoConfirmIndex}
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
          items={mentionItems}
          activeIndex={fileIndex}
          worktreeName={worktreeName}
        />
        <AgentSkillMentionPanel
          isOpen={isSkillMode}
          position={panelPosition}
          skills={matchedSkills}
          activeIndex={skillIndex}
        />
        <MarkdownBlockCommandMenu
          commands={blockCommands}
          activeIndex={blockCommandIndex}
          position={blockCommandPosition}
          visible={isBlockCommandOpen}
        />
        <MarkdownPasteCommandMenu
          activeIndex={pasteIndex}
          options={pasteOptions}
          position={pastePanel?.position}
          visible={Boolean(pastePanel)}
        />

        {/* CodeMirror 编辑器容器：内容自适应（默认最大 12 行），扩大时固定最大 12 行高度（244px）。 */}
        <div
          ref={containerRef}
          style={
            isExpanded ? ({ "--agent-input-height": "244px" } as React.CSSProperties) : undefined
          }
          className={`agent-markdown-input-editor ${
            isExpanded ? "h-[244px]" : "min-h-[44px]"
          } max-h-[244px] w-full overflow-hidden ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        />
      </div>
    )
  },
)

AgentMarkdownInput.displayName = "AgentMarkdownInput"
