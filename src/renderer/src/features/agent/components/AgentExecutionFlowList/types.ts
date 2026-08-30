import {
  AlertCircle,
  AlertOctagon,
  Bot,
  Brain,
  Code2,
  Compass,
  Cpu,
  FileText,
  Minimize2,
  Palette,
  Search,
  Sparkles,
  Terminal,
  User,
  Workflow,
  Wrench,
} from "lucide-react"
import type React from "react"
import type { LxTagColor } from "@/components/ui/LxTag"
import type { ExecutionStep, ExecutionStepKind } from "@/features/agent/types"
import type { TranslationKey } from "@/i18n"

export type FilterKind = "all" | ExecutionStepKind

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
  "text-rose-400",
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
  if (toolName === "render_svg") {
    return { icon: Palette, label: "SVG", tagColor: "amber", textColor: "text-amber-300" }
  }
  if (toolName === "render_ascii") {
    return { icon: Terminal, label: "ASCII", tagColor: "amber", textColor: "text-amber-300" }
  }
  if (toolName === "render_html") {
    return { icon: Code2, label: "HTML", tagColor: "amber", textColor: "text-amber-300" }
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
    case "modelSwitch":
      return { icon: Cpu, labelKey: "agent.kindModelSwitch", tagColor: "teal" }
    case "assistant":
      return { icon: FileText, labelKey: "agent.kindAssistant", tagColor: "emerald" }
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
