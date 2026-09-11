import { defaultKeymap, history, historyKeymap } from "@codemirror/commands"
import { markdown } from "@codemirror/lang-markdown"
import { bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language"
import { languages } from "@codemirror/language-data"
import { EditorState } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { GFM } from "@lezer/markdown"
import { Send, Square } from "lucide-react"
import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
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
import {
  AgentVoiceInputButton,
  type AgentVoiceInputButtonRef,
} from "@/features/agent/components/AgentInput/AgentVoiceInputButton"
import { markdownMarkerHighlight } from "@/features/markdown/extensions/markdownEditorExtensions"
import { useTranslation } from "@/i18n"
import { getClawMentionDeletionRange } from "../clawMention"
import { getMatchedOpenClawCommands, type OpenClawCommandId } from "../openclawCommands"
import { type OpenClawPickerItem, OpenClawPickerPanel } from "./OpenClawPickerPanel"
import { type OpenClawTargetOffice, OpenClawTargetSelect } from "./OpenClawTargetSelect"

export interface OpenClawInputRef {
  focus: () => void
  getValue: () => string
  setValue: (value: string) => void
}

// 由父级驱动的选择面板（`/office`、`/agent`）。
export interface OpenClawInputPicker {
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
  onPickerClose?: () => void
  placeholder?: string
  disabled?: boolean
  isStreaming?: boolean
  // 办公区与员工选择器
  offices?: OpenClawTargetOffice[]
  selectedOfficeId?: string | null
  selectedAgentIds?: string[]
  onSelectOffice?: (officeId: string) => void
  onToggleAgent?: (agentId: string) => void
  voiceButtonRef?: React.Ref<AgentVoiceInputButtonRef>
}

type OpenClawPanelMode = "command" | "mention" | "picker" | null

// 归一化 `@` 提及查询：`@claw:instance/agent` 与 `@claw` 前缀都用于筛选 OpenClaw 候选。
const normalizeClawQuery = (query: string): string | null => {
  const raw = query.toLowerCase()
  if (raw && !raw.startsWith("claw")) return null
  return raw ? raw.slice(4).replace(/^[:/]+/, "") : ""
}

/**
 * OpenClawInput - 布局与样式完全对齐 AgentInput 的输入框容器组件，
 * 内嵌 Markdown 编辑器、命令与提及面板，底部集成语音识别按钮、OpenClaw/Agent 复合选择器与发送按钮。
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
      offices = [],
      selectedOfficeId = null,
      selectedAgentIds = [],
      onSelectOffice,
      onToggleAgent,
      voiceButtonRef,
    },
    ref,
  ): React.JSX.Element => {
    const { t } = useTranslation()
    const containerRef = useRef<HTMLDivElement>(null)
    const editorContainerRef = useRef<HTMLDivElement>(null)
    const editorViewRef = useRef<EditorView | null>(null)

    const [activeMode, setActiveMode] = useState<OpenClawPanelMode>(null)
    const [panelPosition, setPanelPosition] = useState<React.CSSProperties | null>(null)
    const [commandIndex, setCommandIndex] = useState(0)
    const [mentionIndex, setMentionIndex] = useState(0)
    const [pickerIndex, setPickerIndex] = useState(0)
    const [matchedCommands, setMatchedCommands] = useState<AgentInputCommand[]>([])
    const [mentionItems, setMentionItems] = useState<AgentMentionItem[]>([])

    // 语音输入状态（录音中 / 转写中），用于动态切换外框样式与占位符
    const [voiceRecordingState, setVoiceRecordingState] = useState<
      "idle" | "recording" | "transcribing"
    >("idle")

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

    const getPanelAnchor = useCallback((): HTMLElement | null => containerRef.current, [])

    const closePanels = useCallback((): void => {
      setActiveMode(null)
      setMatchedCommands([])
      setMentionItems([])
      setPanelPosition(null)
    }, [])

    // 计算面板位置（基于输入框容器整体宽度对齐）
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

    // 同步面板状态：选择面板 > 命令 > 当前办公区的 @claw 提及
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

    // 初始化 CodeMirror
    useEffect(() => {
      const container = editorContainerRef.current
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
          placeholder(
            voiceRecordingState === "recording"
              ? t("agent.voiceListeningPlaceholder")
              : voiceRecordingState === "transcribing"
                ? t("agent.voiceTranscribingPlaceholder")
                : (placeholderText ?? t("openclaw.placeholder")),
          ),
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
    }, [placeholderText, voiceRecordingState, t])

    // 外部 value 变动同步
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

    // 语音转写文本打字机动画追加至输入框
    const handleVoiceTranscribed = (transcribedText: string): void => {
      const trimmed = transcribedText.trim()
      if (!trimmed) return
      const view = editorViewRef.current
      const current = view?.state.doc.toString() ?? valueRef.current
      const baseText = current
        ? current.endsWith(" ") || current.endsWith("\n")
          ? current
          : `${current} `
        : ""

      let charIndex = 0
      const stepInterval = Math.max(10, Math.min(30, Math.floor(300 / trimmed.length)))

      const timer = setInterval(() => {
        charIndex++
        const partial = trimmed.slice(0, charIndex)
        const nextVal = `${baseText}${partial}`
        onChangeRef.current(nextVal)
        if (editorViewRef.current) {
          editorViewRef.current.dispatch({
            changes: { from: 0, to: editorViewRef.current.state.doc.length, insert: nextVal },
            selection: { anchor: nextVal.length },
          })
        }

        if (charIndex >= trimmed.length) {
          clearInterval(timer)
          editorViewRef.current?.focus()
        }
      }, stepInterval)
    }

    const handleContainerPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
      const target = event.target as HTMLElement
      if (target.closest("button") || target.closest(".cm-editor")) return
      event.preventDefault()
      editorViewRef.current?.focus()
    }

    const actionButton = isStreaming ? (
      <LxIconButton
        shape="circle"
        aria-label={t("openclaw.abort")}
        title={{ content: t("openclaw.abort"), placement: "top" }}
        onClick={onStop}
        hoverBgClass="hover:bg-white/90"
        className="agent-input-action-btn agent-input-stop-btn bg-white !text-black shadow-sm"
      >
        <Square className="h-3 w-3 fill-current" />
      </LxIconButton>
    ) : (
      <LxIconButton
        shape="circle"
        aria-label={t("openclaw.send")}
        title={{ content: t("openclaw.send"), placement: "top" }}
        onClick={onSend}
        disabled={!value.trim() || disabled}
        hoverBgClass="hover:bg-white/90"
        className="agent-input-action-btn agent-input-send-btn bg-white !text-black shadow-sm disabled:!bg-white/15 disabled:!text-white/30 disabled:!opacity-100 disabled:shadow-none"
      >
        <Send className="h-3.5 w-3.5" />
      </LxIconButton>
    )

    return (
      <div className="relative w-full bg-transparent p-0.5 pt-1 pb-0">
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
          className={`agent-input-container relative flex flex-col justify-between rounded-[6px] border bg-[#2a2a2a] px-2.5 pt-2 pb-2 shadow-sm transition-[border-color,box-shadow] duration-150 focus-within:border-white/20 focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.06)] ${
            voiceRecordingState === "recording"
              ? "border-rose-500/40 shadow-[0_0_8px_rgba(244,63,94,0.15)]"
              : voiceRecordingState === "transcribing"
                ? "border-blue-500/40"
                : "border-white/10"
          }`}
          onPointerDown={handleContainerPointerDown}
        >
          <div
            ref={editorContainerRef}
            className={`agent-markdown-input-editor min-h-[44px] max-h-[200px] w-full overflow-hidden ${
              disabled ? "pointer-events-none opacity-50" : ""
            }`}
          />

          <div className="flex w-full items-center justify-between pt-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <AgentVoiceInputButton
                ref={voiceButtonRef}
                onTranscribed={handleVoiceTranscribed}
                onRecordingStateChange={setVoiceRecordingState}
                disabled={disabled}
              />
              {offices.length > 0 && onSelectOffice && onToggleAgent && (
                <OpenClawTargetSelect
                  offices={offices}
                  selectedOfficeId={selectedOfficeId}
                  selectedAgentIds={selectedAgentIds}
                  onSelectOffice={onSelectOffice}
                  onToggleAgent={onToggleAgent}
                  disabled={disabled}
                />
              )}
            </div>

            <div className="flex items-center gap-1.5">{actionButton}</div>
          </div>
        </div>
      </div>
    )
  },
)

OpenClawInput.displayName = "OpenClawInput"
