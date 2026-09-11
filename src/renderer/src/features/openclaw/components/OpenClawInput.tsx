import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import {
  type AgentInputCommand,
  AgentInputCommandPanel,
  AgentInputFilePanel,
  type AgentMentionItem,
  type ClawMentionCandidate,
  getAgentPanelPosition,
} from "@/features/agent/components/AgentInput"
import {
  agentEditorTheme,
  agentHighlightStyle,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/AgentMarkdownInputTheme"
import {
  getMentionQuery,
  isFuzzyMatch,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markdownEditorExtensions"
import { useTranslation } from "@/i18n"
import { getClawMentionDeletionRange } from "../clawMention"
import { getMatchedOpenClawCommands, type OpenClawCommandId } from "../openclawCommands"
import { type OpenClawPickerItem, OpenClawPickerPanel } from "./OpenClawPickerPanel"

export interface OpenClawInputRef {
  focus: () => void
  getValue: () => string
  setValue: (value: string) => void
}

// 由父级驱动的选择面板（`/office`、`/agent`）。
export interface OpenClawInputPicker {
  // 面板标识：仅当标识变化（重新打开）时才重置高亮下标。
  key: string
  title: string
  emptyText: string
  items: OpenClawPickerItem[]
  onPick: (id: string) => void
}

export interface OpenClawInputProps {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  // 仅可提及当前办公区内的 Agent。
  candidates: ClawMentionCandidate[]
  onCommand: (commandId: OpenClawCommandId) => void
  picker?: OpenClawInputPicker | null
  // Esc 关闭选择面板时回调，供父级同步清理 picker 状态。
  onPickerClose?: () => void
  placeholder?: string
  disabled?: boolean
  isStreaming?: boolean
  // 面板定位锚点：整个输入框容器（含 padding/边框），保证面板宽度与输入框一致。
  panelAnchorRef?: React.RefObject<HTMLElement | null>
}

type OpenClawPanelMode = "command" | "mention" | "picker" | null

// 归一化 `@` 提及查询：`@claw:instance/agent` 与 `@claw` 前缀都用于筛选 OpenClaw 候选。
const normalizeClawQuery = (query: string): string | null => {
  const raw = query.toLowerCase()
  if (raw && !raw.startsWith("claw")) return null
  return raw ? raw.slice(4).replace(/^[:/]+/, "") : ""
}

/**
 * OpenClaw 专用 Markdown 输入框：复用 Agent 输入框的编辑器主题与面板组件，
 * 仅保留 OpenClaw 需要的 `/` 命令面板、当前办公区内的 `@claw` 提及面板与选择面板。
 */
export const OpenClawInput = React.forwardRef<OpenClawInputRef, OpenClawInputProps>(
  (
    {
      value,
      onChange,
      onSend,
      onStop,
      candidates,
      onCommand,
      picker = null,
      onPickerClose,
      placeholder: placeholderText,
      disabled = false,
      isStreaming = false,
      panelAnchorRef,
    },
    ref,
  ): React.JSX.Element => {
    const { t } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)
    const editorViewRef = useRef<EditorView | null>(null)

    const [activeMode, setActiveMode] = useState<OpenClawPanelMode>(null)
    const [panelPosition, setPanelPosition] = useState<React.CSSProperties | null>(null)
    const [commandIndex, setCommandIndex] = useState(0)
    const [mentionIndex, setMentionIndex] = useState(0)
    const [pickerIndex, setPickerIndex] = useState(0)
    const [matchedCommands, setMatchedCommands] = useState<AgentInputCommand[]>([])
    const [mentionItems, setMentionItems] = useState<AgentMentionItem[]>([])

    // 供 CodeMirror 键位闭包读取的最新状态。
    const stateRef = useRef({
      activeMode,
      picker,
      commandIndex,
      mentionIndex,
      pickerIndex,
      matchedCommands,
      mentionItems,
      candidates,
      isStreaming,
    })
    stateRef.current = {
      activeMode,
      picker,
      commandIndex,
      mentionIndex,
      pickerIndex,
      matchedCommands,
      mentionItems,
      candidates,
      isStreaming,
    }

    const valueRef = useRef(value)
    valueRef.current = value
    const onChangeRef = useRef(onChange)
    onChangeRef.current = onChange
    const onSendRef = useRef(onSend)
    onSendRef.current = onSend
    const onStopRef = useRef(onStop)
    onStopRef.current = onStop
    const onCommandRef = useRef(onCommand)
    onCommandRef.current = onCommand
    const onPickerCloseRef = useRef(onPickerClose)
    onPickerCloseRef.current = onPickerClose

    const getPanelAnchor = useCallback(
      (): HTMLElement | null => panelAnchorRef?.current ?? containerRef.current,
      [panelAnchorRef],
    )

    const closePanels = useCallback((): void => {
      setActiveMode(null)
      setMatchedCommands([])
      setMentionItems([])
      setPanelPosition(null)
    }, [])

    // 计算面板位置（基于输入框容器整体宽度对齐）。
    const updatePanelPosition = useCallback(
      (kind: "command" | "file"): void => {
        const anchor = getPanelAnchor()
        if (!anchor) {
          setPanelPosition(null)
          return
        }
        setPanelPosition(getAgentPanelPosition(kind, anchor.getBoundingClientRect()))
      },
      [getPanelAnchor],
    )

    // 同步面板状态：选择面板 > 命令 > 当前办公区的 @claw 提及。
    const syncPanels = useCallback(
      (docText: string, cursor: number): void => {
        if (stateRef.current.picker) return

        const commands = getMatchedOpenClawCommands(docText, t)
        if (commands.length > 0) {
          setActiveMode("command")
          setCommandIndex(0)
          setMatchedCommands(commands)
          setMentionItems([])
          updatePanelPosition("command")
          return
        }

        const mention = getMentionQuery(docText, cursor)
        if (mention) {
          const query = normalizeClawQuery(mention.query)
          if (query !== null) {
            const matched = stateRef.current.candidates.filter(
              (candidate) =>
                !query ||
                isFuzzyMatch(query, candidate.name.toLowerCase()) ||
                isFuzzyMatch(query, candidate.agentId.toLowerCase()) ||
                isFuzzyMatch(query, `${candidate.instanceId}/${candidate.agentId}`.toLowerCase()),
            )
            if (matched.length > 0) {
              setActiveMode("mention")
              setMentionIndex(0)
              setMentionItems(matched.map((claw) => ({ kind: "claw", claw })))
              setMatchedCommands([])
              updatePanelPosition("file")
              return
            }
          }
        }

        closePanels()
      },
      [closePanels, t, updatePanelPosition],
    )

    const syncPanelsRef = useRef(syncPanels)
    syncPanelsRef.current = syncPanels

    // 选择面板开关由父级驱动：仅在面板标识变化时重置高亮下标。
    const pickerKey = picker?.key ?? null
    useEffect(() => {
      if (pickerKey) {
        setActiveMode("picker")
        setPickerIndex(0)
        updatePanelPosition("command")
      } else {
        setActiveMode((current) => (current === "picker" ? null : current))
      }
    }, [pickerKey, updatePanelPosition])

    // 应用命令选择：清空输入并交给业务层处理。
    const applyCommand = useCallback((command: AgentInputCommand): void => {
      const view = editorViewRef.current
      if (view) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } })
      }
      onChangeRef.current("")
      setActiveMode(null)
      setMatchedCommands([])
      setPanelPosition(null)
      onCommandRef.current(command.id as OpenClawCommandId)
      editorViewRef.current?.focus()
    }, [])

    // 应用提及选择：在光标处替换为 `@claw:<instance>/<agent> (name) `。
    const applyMention = useCallback((item: AgentMentionItem): void => {
      if (item.kind !== "claw") return
      const view = editorViewRef.current
      if (!view) return
      const text = view.state.doc.toString()
      const cursor = view.state.selection.main.head
      const mention = getMentionQuery(text, cursor)
      if (!mention) return
      const insert = `@claw:${item.claw.instanceId}/${item.claw.agentId} (${item.claw.name}) `
      view.dispatch({
        changes: { from: mention.start, to: cursor, insert },
        selection: { anchor: mention.start + insert.length },
      })
      view.focus()
      setActiveMode(null)
      setMentionItems([])
      setPanelPosition(null)
    }, [])

    const applyMentionRef = useRef(applyMention)
    applyMentionRef.current = applyMention
    const applyCommandRef = useRef(applyCommand)
    applyCommandRef.current = applyCommand

    // 初始化 CodeMirror（一次性）。
    useEffect(() => {
      const container = containerRef.current
      if (!container) return

      const keymapExtension = keymap.of([
        {
          key: "ArrowDown",
          run: () => {
            const {
              activeMode: mode,
              matchedCommands: cmds,
              mentionItems: items,
              picker: activePicker,
            } = stateRef.current
            if (mode === "command" && cmds.length > 0) {
              setCommandIndex((current) => (current + 1) % cmds.length)
              return true
            }
            if (mode === "mention" && items.length > 0) {
              setMentionIndex((current) => (current + 1) % items.length)
              return true
            }
            if (mode === "picker" && activePicker && activePicker.items.length > 0) {
              setPickerIndex((current) => (current + 1) % activePicker.items.length)
              return true
            }
            return false
          },
        },
        {
          key: "ArrowUp",
          run: () => {
            const {
              activeMode: mode,
              matchedCommands: cmds,
              mentionItems: items,
              picker: activePicker,
            } = stateRef.current
            if (mode === "command" && cmds.length > 0) {
              setCommandIndex((current) => (current - 1 + cmds.length) % cmds.length)
              return true
            }
            if (mode === "mention" && items.length > 0) {
              setMentionIndex((current) => (current - 1 + items.length) % items.length)
              return true
            }
            if (mode === "picker" && activePicker && activePicker.items.length > 0) {
              setPickerIndex(
                (current) => (current - 1 + activePicker.items.length) % activePicker.items.length,
              )
              return true
            }
            return false
          },
        },
        {
          key: "Escape",
          run: () => {
            if (stateRef.current.activeMode) {
              if (stateRef.current.activeMode === "picker") onPickerCloseRef.current?.()
              setActiveMode(null)
              setMatchedCommands([])
              setMentionItems([])
              setPanelPosition(null)
              return true
            }
            if (stateRef.current.isStreaming) {
              onStopRef.current()
              return true
            }
            return false
          },
        },
        {
          key: "Enter",
          run: () => {
            const {
              activeMode: mode,
              commandIndex: ci,
              mentionIndex: mi,
              pickerIndex: pi,
              matchedCommands: cmds,
              mentionItems: items,
              picker: activePicker,
            } = stateRef.current
            if (mode === "command") {
              const command = cmds[ci] ?? cmds[0]
              if (command) {
                applyCommandRef.current(command)
                return true
              }
            }
            if (mode === "mention") {
              const item = items[mi] ?? items[0]
              if (item) {
                applyMentionRef.current(item)
                return true
              }
            }
            if (mode === "picker" && activePicker) {
              const picked = activePicker.items[pi] ?? activePicker.items[0]
              if (picked) {
                activePicker.onPick(picked.id)
                return true
              }
            }
            onSendRef.current()
            return true
          },
          shift: (view) => {
            const cursor = view.state.selection.main.head
            view.dispatch({ changes: { from: cursor, to: cursor, insert: "\n" } })
            return true
          },
        },
        {
          key: "Backspace",
          run: (view) => {
            if (stateRef.current.activeMode) return false
            const selection = view.state.selection.main
            if (selection.from !== selection.to) return false
            const range = getClawMentionDeletionRange(view.state.doc.toString(), selection.from)
            if (!range) return false
            view.dispatch({
              changes: { from: range.from, to: range.to, insert: "" },
              selection: { anchor: range.from },
            })
            return true
          },
        },
        { key: "Tab", preventDefault: true, run: () => true },
      ])

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
          keymapExtension,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholder(placeholderText ?? ""),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              syncPanelsRef.current(update.state.doc.toString(), update.state.selection.main.head)
            }
          }),
          EditorView.domEventHandlers({
            keydown: (event) => {
              if (event.key === "Tab") {
                event.preventDefault()
                return true
              }
              return false
            },
          }),
        ],
      })

      const view = new EditorView({ state, parent: container })
      editorViewRef.current = view
      return () => {
        view.destroy()
        editorViewRef.current = null
      }
    }, [placeholderText])

    // 外部 value 变动同步回 CodeMirror。
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

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editorViewRef.current?.focus(),
        getValue: () => valueRef.current,
        setValue: (next: string) => {
          const view = editorViewRef.current
          if (!view) return
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: next },
            selection: { anchor: next.length },
          })
        },
      }),
      [],
    )

    return (
      <div className="agent-markdown-input-wrapper relative min-w-0 flex-1">
        <AgentInputCommandPanel
          isOpen={activeMode === "command"}
          position={panelPosition}
          commands={matchedCommands}
          activeIndex={commandIndex}
        />
        <AgentInputFilePanel
          isOpen={activeMode === "mention"}
          position={panelPosition}
          items={mentionItems}
          activeIndex={mentionIndex}
        />
        <OpenClawPickerPanel
          isOpen={activeMode === "picker"}
          position={panelPosition}
          title={picker?.title ?? ""}
          emptyText={picker?.emptyText ?? ""}
          items={picker?.items ?? []}
          activeIndex={pickerIndex}
        />
        <div
          ref={containerRef}
          className={`agent-markdown-input-editor min-h-[44px] max-h-[200px] w-full overflow-hidden ${
            disabled ? "pointer-events-none opacity-50" : ""
          }`}
        />
      </div>
    )
  },
)

OpenClawInput.displayName = "OpenClawInput"
