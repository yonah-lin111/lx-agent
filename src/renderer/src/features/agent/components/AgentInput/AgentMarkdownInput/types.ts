import type React from "react"
import type { GitWorktreeOption } from "@/features/git"
import type { AgentInputFile } from "../AgentInputFiles"

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
  worktreeName?: string
  onWorktreeSelect?: (path: string) => void
  onClear?: () => void
  onUndo?: () => void
  isOnlyOneTurnLeft?: () => boolean
  onCompact?: () => void
  onAddFiles?: (files: AgentInputFile[]) => void
}

export type AgentInputActiveMode =
  | "command"
  | "file"
  | "model"
  | "worktree"
  | "undo_confirm"
  | "skill"
  | null

export interface AgentInputPastePanelState {
  from: number
  insertion: string
  referenceInsertion: string
  originalText: string
  paths: { path: string; type: "folder" | "file" | "image" }[]
  position: React.CSSProperties
}
