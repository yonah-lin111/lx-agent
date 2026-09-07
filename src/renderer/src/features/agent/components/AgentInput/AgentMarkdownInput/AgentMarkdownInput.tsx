import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import React, { useCallback, useEffect, useImperativeHandle, useRef } from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { usePromptHistory } from "@/features/agent/hooks/usePromptHistory"
import { GitWorktreeCommandMenu } from "@/features/git"
import { MarkdownBlockCommandMenu } from "@/features/markdown/components/MarkdownBlockCommandMenu"
import { MarkdownPasteCommandMenu } from "@/features/markdown/components/MarkdownPasteCommandMenu"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markdownEditorExtensions"
import { useTranslation } from "@/i18n"
import {
  AgentInputCommandPanel,
  AgentInputFilePanel,
  AgentInputModelPanel,
  AgentSkillMentionPanel,
  AgentUndoConfirmPanel,
} from "../AgentInputCommandPanels"
import { agentEditorTheme, agentHighlightStyle } from "./AgentMarkdownInputTheme"
import { useAgentInputActions } from "./hooks/useAgentInputActions"
import { useAgentInputKeymap } from "./hooks/useAgentInputKeymap"
import { useAgentInputPanels } from "./hooks/useAgentInputPanels"
import { useAgentInputPaste } from "./hooks/useAgentInputPaste"
import type { AgentMarkdownInputProps, AgentMarkdownInputRef } from "./types"

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
    const { t, locale } = useTranslation()

    const getPanelAnchor = useCallback((): HTMLElement | null => {
      return panelAnchorRef?.current ?? containerRef.current
    }, [panelAnchorRef])

    const { browsing, record, reset, navigate } = usePromptHistory()
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
    const escStopRef = useRef(0)

    // 面板状态管理
    const panels = useAgentInputPanels({
      value,
      editorViewRef,
      projectId,
      projectPath,
      currentPath,
      modelOptions,
      worktreeOptions,
      getPanelAnchor,
      t,
      locale,
    })

    // 粘贴面板与引用管理
    const paste = useAgentInputPaste({
      editorViewRef,
      getPanelAnchor,
      onAddFiles,
      t,
    })
    const handlePasteEventRef = useRef(paste.handlePasteEvent)
    handlePasteEventRef.current = paste.handlePasteEvent

    // 动作执行管理
    const actions = useAgentInputActions({
      editorViewRef,
      valueRef,
      onChangeRef,
      onSendRef,
      onClear,
      onUndo,
      onCompact,
      onModelChange,
      onWorktreeSelect,
      isOnlyOneTurnLeft,
      setActiveMode: panels.setActiveMode,
      setUndoConfirmIndex: panels.setUndoConfirmIndex,
      updatePanelPosition: panels.updatePanelPosition,
      setBlockCommands: panels.setBlockCommands,
      setBlockCommandPosition: panels.setBlockCommandPosition,
      record,
      reset,
      successToast,
      errorToast,
      warningToast,
      t,
    })

    // 按键与快捷键映射
    const agentKeymapExtension = useAgentInputKeymap({
      editorViewRef,
      pastePanelRef: paste.pastePanelRef,
      pasteOptionsRef: paste.pasteOptionsRef,
      pasteIndexRef: paste.pasteIndexRef,
      setPasteIndex: paste.setPasteIndex,
      closePastePanel: paste.closePastePanel,
      selectPasteReference: paste.selectPasteReference,
      activeModeRef: panels.activeModeRef,
      setActiveMode: panels.setActiveMode,
      undoConfirmIndexRef: panels.undoConfirmIndexRef,
      setUndoConfirmIndex: panels.setUndoConfirmIndex,
      commandIndexRef: panels.commandIndexRef,
      setCommandIndex: panels.setCommandIndex,
      matchedCommandsRef: panels.matchedCommandsRef,
      modelIndexRef: panels.modelIndexRef,
      setModelIndex: panels.setModelIndex,
      matchedModelsRef: panels.matchedModelsRef,
      worktreeIndexRef: panels.worktreeIndexRef,
      setWorktreeIndex: panels.setWorktreeIndex,
      matchedWorktreesRef: panels.matchedWorktreesRef,
      fileIndexRef: panels.fileIndexRef,
      setFileIndex: panels.setFileIndex,
      mentionItemsRef: panels.mentionItemsRef,
      skillIndexRef: panels.skillIndexRef,
      setSkillIndex: panels.setSkillIndex,
      matchedSkillsRef: panels.matchedSkillsRef,
      blockCommandsRef: panels.blockCommandsRef,
      blockCommandIndexRef: panels.blockCommandIndexRef,
      setBlockCommandIndex: panels.setBlockCommandIndex,
      setBlockCommands: panels.setBlockCommands,
      setBlockCommandPosition: panels.setBlockCommandPosition,
      browsingRef,
      navigateRef,
      handleSendAction: actions.handleSendAction,
      executeCommand: actions.executeCommand,
      selectModel: actions.selectModel,
      selectWorktree: actions.selectWorktree,
      selectFile: actions.selectFile,
      selectSkill: actions.selectSkill,
      selectSkillFromMention: actions.selectSkillFromMention,
      selectBlockCommand: actions.selectBlockCommand,
      onChangeRef,
      onUndo,
      isStreamingRef,
      escStopRef,
      onStopRef,
      warningToast,
      t,
    })

    // 暴露外部 ref
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
        doc: valueRef.current,
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
          agentKeymapExtension,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholder(placeholderText),
          EditorView.updateListener.of((update) => {
            if (paste.pastePanelRef.current) {
              const panel = paste.pastePanelRef.current
              const currentDoc = update.state.doc.toString()
              const insertedText = currentDoc.slice(panel.from, panel.from + panel.insertion.length)
              const cursor = update.state.selection.main.head
              const isCursorInRange =
                cursor >= panel.from && cursor <= panel.from + panel.insertion.length
              if (insertedText !== panel.insertion || !isCursorInRange) {
                paste.closePastePanel(false)
              }
            }
            if (update.docChanged) {
              const newDoc = update.state.doc.toString()
              onChangeRef.current(newDoc)
            }
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head
              const docText = update.state.doc.toString()
              panels.syncPanelsRef.current(docText, cursor, update.view)
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
              return handlePasteEventRef.current(event, view)
            },
            focus: (_event, view) => {
              const cursor = view.state.selection.main.head
              const docText = view.state.doc.toString()
              panels.syncPanelsRef.current(docText, cursor, view)
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
          selection: { anchor: value.length },
        })
      }
    }, [value])

    return (
      <div className="agent-markdown-input-wrapper relative min-w-0 flex-1">
        {/* 面板集合 */}
        <AgentInputCommandPanel
          isOpen={panels.isCommandMode}
          position={panels.panelPosition}
          commands={panels.matchedCommands}
          activeIndex={panels.commandIndex}
        />
        <AgentUndoConfirmPanel
          isOpen={panels.isUndoConfirmMode}
          position={panels.panelPosition}
          activeIndex={panels.undoConfirmIndex}
        />
        <AgentInputModelPanel
          isOpen={panels.isModelMode}
          position={panels.panelPosition}
          models={panels.matchedModels}
          activeIndex={panels.modelIndex}
        />
        <GitWorktreeCommandMenu
          visible={panels.isWorktreeMode}
          position={panels.panelPosition ?? undefined}
          options={panels.matchedWorktrees}
          activeIndex={panels.worktreeIndex}
        />
        <AgentInputFilePanel
          isOpen={panels.isFileMode}
          position={panels.panelPosition}
          items={panels.mentionItems}
          activeIndex={panels.fileIndex}
          worktreeName={worktreeName}
        />
        <AgentSkillMentionPanel
          isOpen={panels.isSkillMode}
          position={panels.panelPosition}
          skills={panels.matchedSkills}
          activeIndex={panels.skillIndex}
        />
        <MarkdownBlockCommandMenu
          commands={panels.blockCommands}
          activeIndex={panels.blockCommandIndex}
          position={panels.blockCommandPosition}
          visible={panels.isBlockCommandOpen}
        />
        <MarkdownPasteCommandMenu
          activeIndex={paste.pasteIndex}
          options={paste.pasteOptions}
          position={paste.pastePanel?.position}
          visible={Boolean(paste.pastePanel)}
        />

        {/* CodeMirror 编辑器容器 */}
        <div
          ref={containerRef}
          className={`agent-markdown-input-editor min-h-[44px] max-h-[244px] w-full overflow-hidden ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        />
      </div>
    )
  },
)

AgentMarkdownInput.displayName = "AgentMarkdownInput"
