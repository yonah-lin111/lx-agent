import type { AutoConfigurableMode, CollaborationMode } from "@shared/contracts/agent"
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
  allowProjectChange?: boolean
  onProjectSelect?: (projectId: string, projectPath: string) => void
  onCdSelect?: (projectId: string, projectPath: string) => void
  onSessionSelect?: (sessionId: string) => void
  currentSessionId?: string | null
  // 基础协作模式（如 auto）。
  collaborationMode?: CollaborationMode
  // 当前输入框生效的协作模式（用于输入区域模式着色与底纹）。
  inputMode?: CollaborationMode
  // Auto 编排下允许启用的模式列表（用于 @agentMode 补全候选裁剪）。
  autoEnabledModes?: AutoConfigurableMode[]
}

export type AgentInputActiveMode =
  | "command"
  | "file"
  | "model"
  | "worktree"
  | "project"
  | "session"
  | "undo_confirm"
  | "skill"
  | "historyPrompt"
  | null

export interface AgentInputPastePanelState {
  from: number
  insertion: string
  referenceInsertion: string
  originalText: string
  paths: { path: string; type: "folder" | "file" | "image" }[]
  position: React.CSSProperties
}
