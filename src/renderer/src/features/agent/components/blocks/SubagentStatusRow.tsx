import type { SubagentData } from "@shared/contracts/agent"
import { CornerDownRight } from "lucide-react"
import type React from "react"
import { Fragment } from "react"
import {
  isMcpToolCall,
  isSkillToolCall,
  isWebSearchToolCall,
} from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import type { ExecutionToolContent } from "@/features/agent/types"
import { type TranslationKey, useTranslation } from "@/i18n"
import { ToolCallTitle } from "./ToolCallTitle"

// 子代理展示状态（运行中 / 完成 / 失败）。
export type SubagentDisplayStatus = "running" | "done" | "error"

/**
 * 子代理快照状态 → 展示状态：终态优先（aborted 归入 error），
 * 旧持久化数据无 status 时回退调用方判定（配对工具结果 / 步骤状态）。
 */
export const resolveSubagentDisplayStatus = (
  subagent: SubagentData | undefined,
  fallback: SubagentDisplayStatus,
): SubagentDisplayStatus => {
  switch (subagent?.status) {
    case "running":
      return "running"
    case "done":
      return "done"
    case "error":
    case "aborted":
      return "error"
    default:
      return fallback
  }
}

// 统计段：计数 + 单复数 i18n key。
interface SubagentStatSegment {
  count: number
  singular: TranslationKey
  plural: TranslationKey
}

// 状态行内容：运行中展示当前内部工具，完成后展示调用统计段。
export type SubagentStatusRowContent =
  | { kind: "tool"; toolContent: ExecutionToolContent }
  | { kind: "stats"; isError: boolean; segments: SubagentStatSegment[] }

// 统计子代理内部思考块数量（快照 messages 是思考来源，steps 只含工具调用）。
const countThinking = (subagent: SubagentData | undefined): number =>
  subagent?.messages
    ?.filter((message) => message.role === "assistant")
    .reduce((count, message) => {
      if (!Array.isArray(message.content)) return count
      return count + message.content.filter((block) => block.type === "thinking").length
    }, 0) ?? 0

/**
 * 解析子代理状态行内容：
 * 运行中 = 最近一个 running 的内部工具（无则回退最后一个步骤）；
 * 完成后 = 工具/技能/联网/MCP/思考调用统计段（失败时带 isError 标记）；无可展示内容时返回 null。
 */
export const resolveSubagentStatusRow = (
  subagent: SubagentData | undefined,
  status: SubagentDisplayStatus,
): SubagentStatusRowContent | null => {
  const steps = subagent?.steps ?? []

  if (status === "running") {
    if (steps.length === 0) return null
    const current =
      [...steps].reverse().find((step) => step.status === "running") ?? steps[steps.length - 1]
    return { kind: "tool", toolContent: { toolName: current.toolName, args: current.args } }
  }

  let toolCalls = 0
  let skillCalls = 0
  let mcpCalls = 0
  let webSearches = 0
  for (const step of steps) {
    if (isSkillToolCall(step.toolName)) skillCalls++
    else if (isWebSearchToolCall(step.toolName)) webSearches++
    else if (isMcpToolCall(step.toolName)) mcpCalls++
    else toolCalls++
  }

  const allSegments: SubagentStatSegment[] = [
    {
      count: countThinking(subagent),
      singular: "agent.statsThought",
      plural: "agent.statsThoughts",
    },
    { count: toolCalls, singular: "agent.statsToolCall", plural: "agent.statsToolCalls" },
    { count: skillCalls, singular: "agent.statsSkillCall", plural: "agent.statsSkillCalls" },
    { count: mcpCalls, singular: "agent.statsMcpCall", plural: "agent.statsMcpCalls" },
    { count: webSearches, singular: "agent.statsWebSearch", plural: "agent.statsWebSearches" },
  ]
  const segments = allSegments.filter((segment) => segment.count > 0)

  const isError = status === "error"
  if (segments.length === 0 && !isError) return null
  return { kind: "stats", isError, segments }
}

// 子代理状态行属性。
export interface SubagentStatusRowProps {
  // 子代理快照（提供内部步骤与思考消息）。
  subagent: SubagentData | undefined
  // 展示状态：运行中展示当前内部工具，完成/失败展示统计段。
  status: SubagentDisplayStatus
  // 调用方布局/主题类名（附加在基础行样式之后）。
  className?: string
  // 测试标识（消息列表与执行流程各自的定位锚点）。
  testId?: string
}

/**
 * SubagentStatusRow - 子代理状态行：直角图标 + 运行中的当前内部工具（或完成后的调用统计），
 * 与执行流程分组统计行同构（占位 + 直角图标 + 文本）。
 */
export const SubagentStatusRow = ({
  subagent,
  status,
  className,
  testId,
}: SubagentStatusRowProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  const content = resolveSubagentStatusRow(subagent, status)
  if (!content) return null

  return (
    <div
      data-testid={testId}
      data-subagent-row={content.kind}
      className={`flex min-w-0 items-start gap-1.5 text-xs text-[var(--color-theme-text-subtle,rgba(255,255,255,0.35))] ${className ?? ""}`}
    >
      {/* 与折叠箭头同宽占位，使直角图标与上一行标题对齐 */}
      <span aria-hidden className="w-3.5 shrink-0" />
      <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-[var(--color-theme-text-muted,rgba(255,255,255,0.5))]" />
      {content.kind === "tool" ? (
        <div className="flex min-w-0 flex-1 items-center overflow-hidden leading-none">
          <ToolCallTitle toolContent={content.toolContent} />
        </div>
      ) : (
        <span className="agent-subagent-stats flex min-w-0 flex-1 flex-wrap items-center leading-relaxed">
          {content.isError && (
            <span className="agent-subagent-error font-semibold text-red-400">
              {t("agent.kindError")}
            </span>
          )}
          {content.segments.map((segment, index) => (
            <Fragment key={segment.plural}>
              {(index > 0 || content.isError) && <span className="px-1 opacity-40">·</span>}
              <span>{segment.count}</span>
              <span className="ml-0.5">
                {segment.count === 1 ? t(segment.singular) : t(segment.plural)}
              </span>
            </Fragment>
          ))}
        </span>
      )}
    </div>
  )
}
