import {
  AlertCircle,
  AlertOctagon,
  Bot,
  Brain,
  ClipboardCheck,
  Code2,
  Compass,
  Cpu,
  FileText,
  Minimize2,
  Palette,
  Search,
  ShieldAlert,
  Sparkles,
  Terminal,
  Undo2,
  User,
  Webhook,
  Workflow,
  Wrench,
} from "lucide-react"
import type React from "react"
import type { LxTagColor } from "@/components/ui/LxTag"
import { isMcpToolCall } from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import type { useModelSettings } from "@/features/agent/hooks/modelsStore"
import type {
  ChatMessage,
  ExecutionStep,
  ExecutionStepKind,
  ProposedPlanData,
  ReviewFindingItem,
} from "@/features/agent/types"
import type { TranslationKey } from "@/i18n"

export type FilterKind = "all" | "calls" | "mcp" | "webSearch" | ExecutionStepKind

export const isWebSearchTool = (toolName: string): boolean =>
  toolName === "web_search" || toolName === "webfetch"

export interface ExecutionFlowStats {
  turnsCount: number
  totalSteps: number
  toolCallsCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
}

export interface TurnStats {
  turn: number
  model?: string
  variant?: string
  toolCallsCount: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  totalTokens: number
  durationMs: number
  isCompleted: boolean
}

/**
 * 复制文本辅助函数
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * 格式化 JSON 字符串
 */
export const formatJsonString = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * 格式化执行耗时
 */
export const formatDurationMs = (ms: number): string => {
  if (ms < 1000) return `${Math.round(ms)}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`
}

/**
 * 格式化 Token 计数
 */
export const formatTokenCount = (n: number): string => {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * 格式化 Token 简短计数（IN / OUT 展示用）
 */
export const formatTokensShort = (count: number): string => {
  if (count < 1000) return count.toString()
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`
  if (count < 1000000) return `${Math.round(count / 1000)}k`
  return `${(count / 1000000).toFixed(1)}M`
}

/**
 * 并行调用批次颜色循环池（同一 turn 内不同批次异色，同批次同色）
 */
export const PARALLEL_BATCH_COLORS = [
  "text-sky-400",
  "text-purple-400",
  "text-emerald-400",
  "text-amber-400",
  "text-cyan-400",
  "text-indigo-400",
] as const

/**
 * 格式化时间戳
 */
export const formatTimestampTime = (timestamp?: number): string => {
  if (!timestamp) return ""
  const d = new Date(timestamp)
  return d.toTimeString().split(" ")[0] || ""
}

export const getToolCategoryMeta = (
  toolName: string,
): {
  icon: React.ComponentType<{ className?: string }>
  label: string
  tagColor: "teal" | "purple" | "emerald" | "sky" | "blue" | "default" | "amber"
  textColor: string
} => {
  if (toolName === "edit" || toolName === "write" || toolName === "apply_patch") {
    return { icon: Code2, label: "Coding", tagColor: "amber", textColor: "text-amber-300" }
  }
  if (toolName === "task") {
    return { icon: Bot, label: "Subagent", tagColor: "blue", textColor: "text-blue-300" }
  }
  if (toolName === "read_skill") {
    return { icon: Sparkles, label: "Skill", tagColor: "purple", textColor: "text-violet-300" }
  }
  if (toolName === "web_search" || toolName === "webfetch") {
    return { icon: Search, label: "Web", tagColor: "sky", textColor: "text-sky-300" }
  }
  if (toolName.startsWith("job_") || toolName === "switch_mode") {
    return { icon: Terminal, label: "Tool", tagColor: "amber", textColor: "text-amber-300" }
  }
  if (toolName.includes("_")) {
    return { icon: Terminal, label: "MCP", tagColor: "teal", textColor: "text-cyan-300" }
  }
  return { icon: Wrench, label: "Tool", tagColor: "amber", textColor: "text-amber-300" }
}

/**
 * 批量扇出子代理步骤（task tasks[]）：详情为逐项子代理列表。
 */
export const isBatchSubagentStep = (step: ExecutionStep): boolean =>
  step.kind === "subagent" && (step.subagentContent?.subagents?.length ?? 0) > 0

/**
 * 获取步骤图标与样式配置
 */
export const getKindMeta = (
  step: ExecutionStep,
): {
  icon?: React.ComponentType<{ className?: string }>
  labelKey?: TranslationKey
  customLabel?: string
  tagColor: LxTagColor
  textColor?: string
} => {
  switch (step.kind) {
    case "system":
      return { icon: Compass, labelKey: "agent.kindSystem", tagColor: "indigo" }
    case "user":
      return { icon: User, labelKey: "agent.kindUser", tagColor: "amber" }
    case "thinking":
      return { icon: Brain, labelKey: "agent.kindThinking", tagColor: "purple" }
    case "tool": {
      const toolName = step.toolContent?.toolName || step.title
      if (isWebSearchTool(toolName)) {
        return {
          icon: Search,
          labelKey: "agent.kindWebSearch",
          tagColor: "sky",
          textColor: "text-sky-300",
        }
      }
      if (isMcpToolCall(toolName)) {
        return {
          icon: Terminal,
          labelKey: "agent.kindMcp",
          tagColor: "teal",
          textColor: "text-teal-300",
        }
      }
      return {
        labelKey: "agent.kindTool",
        tagColor: "amber",
        textColor: "text-amber-300",
      }
    }
    case "subagent":
      return { icon: Bot, labelKey: "agent.kindSubagent", tagColor: "blue" }
    case "compaction":
      return { icon: Minimize2, labelKey: "agent.kindCompaction", tagColor: "indigo" }
    case "undo":
      return {
        icon: Undo2,
        labelKey: "agent.kindUndo",
        tagColor: "rose",
        textColor: "text-rose-300",
      }
    case "modelSwitch":
      return {
        icon: Cpu,
        labelKey: "agent.kindModelSwitch",
        tagColor: "gray",
        textColor: "text-cyan-300",
      }
    case "hook":
      return { icon: Webhook, labelKey: "agent.kindHook", tagColor: "orange" }
    case "assistant":
      return { icon: FileText, labelKey: "agent.kindAssistant", tagColor: "emerald" }
    case "proposedPlan":
      return { icon: ClipboardCheck, labelKey: "agent.proposedPlanBadge", tagColor: "emerald" }
    case "reviewFindings":
      return { icon: ShieldAlert, labelKey: "agent.review.badge", tagColor: "purple" }
    case "frontDesign":
      return { icon: Palette, labelKey: "frontDesign.designCardBadge", tagColor: "pink" }
    case "error": {
      const isAborted = step.errorContent?.isAborted ?? step.errorContent?.stopReason === "aborted"
      if (isAborted) {
        return {
          icon: AlertOctagon,
          customLabel: "aborted",
          tagColor: "amber",
          textColor: "text-amber-300",
        }
      }
      return {
        icon: AlertCircle,
        labelKey: "agent.kindError",
        tagColor: "rose",
        textColor: "text-rose-300",
      }
    }
    default:
      return { icon: Workflow, labelKey: "agent.executionFlow", tagColor: "default" }
  }
}

// 输入区导航按钮状态。
export interface AgentFlowNavState {
  canScrollBottom: boolean
}

// 执行流程列表命令式句柄：供输入区回到底部按钮调用。
export interface AgentExecutionFlowListRef {
  scrollToBottom: () => void
}

export interface AgentExecutionFlowListProps {
  // 当前会话的全部消息列表
  messages: readonly ChatMessage[]
  // 是否正在流式生成/运行中
  isStreaming?: boolean
  // 当前会话 ID（用于查询完整装配的系统提示词）
  sessionId?: string
  // 当前项目或工作区路径
  cwd?: string
  // 点击推荐提示词回调
  onSelectPrompt?: (prompt: string) => void
  // 导航状态变化回调（驱动输入区上一个/下一个/回到底部按钮可用性）
  onNavigationStateChange?: (state: AgentFlowNavState) => void
  // "继续生成"可用（最后一条 AI 回答被截断/中止且未在流式）
  canContinue?: boolean
  // 点击"继续生成"：续写被中断的上一轮输出
  onContinue?: () => void
  // 采纳并执行实施方案
  onAcceptPlan?: (plan: ProposedPlanData) => void
  // 采纳并修复代码审查项
  onApplyReviewFixes?: (selectedFindings: ReviewFindingItem[]) => void
  // 审查项回填到输入框
  onFillInput?: (text: string) => void
  // 删除指定 AI 消息所在的一轮对话
  onDeleteMessage?: (messageId: string) => void
  // 子代理面板开合回传（父级据此遮盖并 inert 输入区与状态栏）
  onSubagentPanelOpenChange?: (isOpen: boolean) => void
  // 是否只读模式
  readOnly?: boolean
}

// 执行流程渲染元素：单个步骤或同轮折叠组。
export type FlowRenderElement =
  | { kind: "single"; step: ExecutionStep }
  | { kind: "group"; groupId: string; steps: ExecutionStep[]; turnIndex: number }

// 模型设置状态（modelsStore）。
export type ModelSettingsState = ReturnType<typeof useModelSettings>
