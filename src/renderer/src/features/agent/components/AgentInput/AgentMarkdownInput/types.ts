import type { AutoConfigurableMode, CollaborationMode } from "@shared/contracts/agent"
import type React from "react"
import type { AgentUndoOption } from "@/features/agent/types"
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
  // /btw 发送回调（问题文本；主输入框路由到侧问线）。
  onBtwSend?: (question: string) => void
  // 是否可用 /btw（无 QA 的主会话隐藏该命令并拦截发送）。
  canUseBtw?: boolean
  // 是否启用命令/提及面板（btw 面板精简模式下整体关闭）。
  commandPanelEnabled?: boolean
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
  // /undo 选项面板选择回调（回退文件并撤销对话 / 仅撤销对话 / 仅回退文件）。
  onUndoOption?: (option: AgentUndoOption) => void
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
  | "undo_options"
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
