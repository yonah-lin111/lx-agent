import {
  Bot,
  Brain,
  Code2,
  Compass,
  FileText,
  Minimize2,
  Search,
  Sparkles,
  Terminal,
  User,
  Workflow,
  Wrench,
} from "lucide-react"
import type React from "react"
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

export const getToolCategoryMeta = (
  toolName: string,
): {
  icon: React.ComponentType<{ className?: string }>
  label: string
  tagColor: "teal" | "purple" | "emerald" | "sky" | "blue" | "default"
  textColor: string
} => {
  if (toolName === "edit" || toolName === "write") {
    return { icon: Code2, label: "Coding", tagColor: "emerald", textColor: "text-emerald-300" }
  }
  if (toolName === "task") {
    return { icon: Bot, label: "Subagent", tagColor: "blue", textColor: "text-blue-300" }
  }
  if (toolName === "read_skill") {
    return { icon: Sparkles, label: "Skill", tagColor: "purple", textColor: "text-violet-300" }
  }
  if (toolName === "web_search" || toolName === "webfetch") {
    return { icon: Search, label: "Web", tagColor: "emerald", textColor: "text-emerald-300" }
  }
  if (toolName.includes("_")) {
    return { icon: Terminal, label: "MCP", tagColor: "teal", textColor: "text-cyan-300" }
  }
  return { icon: Wrench, label: "Tool", tagColor: "sky", textColor: "text-amber-300" }
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
  tagColor: "indigo" | "amber" | "purple" | "sky" | "blue" | "emerald" | "teal" | "default"
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
        customLabel: "tool_schema",
        tagColor: "sky",
        textColor: "text-sky-300",
      }
    }
    case "subagent":
      return { icon: Bot, labelKey: "agent.kindSubagent", tagColor: "blue" }
    case "compaction":
      return { icon: Minimize2, labelKey: "agent.kindCompaction", tagColor: "indigo" }
    case "assistant":
      return { icon: FileText, labelKey: "agent.kindAssistant", tagColor: "emerald" }
    default:
      return { icon: Workflow, labelKey: "agent.executionFlow", tagColor: "default" }
  }
}
