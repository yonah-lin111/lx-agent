import { Bot, CornerDownRight } from "lucide-react"
import type React from "react"
import { Fragment } from "react"
import { ToolCallTitle } from "@/features/agent/components/blocks/ToolCallTitle"
import type { AgentMessage, ChatBlock, SubagentStep } from "@/features/agent/types"
import { formatSubagentLabel } from "@/features/agent/utils/subagentLabel"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 子代理调用展示组件属性类型。
interface AgentSubagentBlockProps {
  // 子代理（task 工具）调用。
  toolCall: ToolCallBlock
  // 点击顶部 label 打开子代理面板弹窗。
  onOpen?: (toolCall: ToolCallBlock) => void
}

// 步骤类型（统计归类）。
type StepKind = "tool" | "mcp" | "webSearch"

// 步骤类型：web_search 与内置工具为普通工具，含下划线全名为 MCP 调用。
const getStepKind = (toolName: string): StepKind => {
  if (toolName === "web_search") return "webSearch"
  if (
    !["web_search", "apply_patch", "read_skill", "job_output", "job_list", "job_kill"].includes(
      toolName,
    ) &&
    toolName.includes("_")
  )
    return "mcp"
  return "tool"
}

// 提取子代理名（缺失/非法时兜底 "task"）。
const getSubagentName = (toolCall: ToolCallBlock): string =>
  toolCall.subagent?.name?.trim() || "task"

// 按类型统计工具步骤。
const countSteps = (steps: SubagentStep[]): { tool: number; mcp: number; webSearch: number } => {
  const counts = { tool: 0, mcp: 0, webSearch: 0 }
  for (const step of steps) counts[getStepKind(step.toolName)]++
  return counts
}

// 统计子代理内部思考块数量。
const countThinking = (messages: AgentMessage[] | undefined): number =>
  messages
    ?.filter((message) => message.role === "assistant")
    .reduce((count, message) => {
      if (!Array.isArray(message.content)) return count
      return count + message.content.filter((block) => block.type === "thinking").length
    }, 0) ?? 0

/**
 * AgentSubagentBlock - 渲染子代理（task 工具）调用：名称（点击打开面板）+ 运行中的当前内部工具 /
 * 完成后的统计行（错误状态前置 Error 标记）。
 */
export const AgentSubagentBlock = ({
  toolCall,
  onOpen,
}: AgentSubagentBlockProps): React.JSX.Element | null => {
  if (!toolCall) return null

  const name = getSubagentName(toolCall)
  const subagent = toolCall.subagent
  const label = formatSubagentLabel(name, subagent?.roleName)
  const steps = subagent?.steps ?? []
  const isRunning = toolCall.status === "running"
  const isError = toolCall.status === "error"
  // 运行中展示当前正在执行的内部工具：优先最后一个 running 步骤，否则回退最后一个步骤。
  const currentStep = isRunning
    ? ([...steps].reverse().find((step) => step.status === "running") ?? steps[steps.length - 1])
    : undefined
  const thinkingCount = countThinking(subagent?.messages)
  const { tool: toolCount, mcp: mcpCount, webSearch: webSearchCount } = countSteps(steps)
  const countSegments = [
    { count: toolCount, singular: "Tool Call", plural: "Tool Calls" },
    { count: thinkingCount, singular: "Thought", plural: "Thoughts" },
    { count: mcpCount, singular: "MCP Call", plural: "MCP Calls" },
    { count: webSearchCount, singular: "Web Search", plural: "Web Searches" },
  ].filter((segment) => segment.count > 0)

  return (
    <div className="agent-subagent-block my-0.5 min-w-0">
      {/* 顶部 label：Subagent 名称 + 子代理名（AI 分发时注明原始名称），点击打开面板。 */}
      <button
        type="button"
        aria-label={`View subagent ${name} details`}
        onClick={() => onOpen?.(toolCall)}
        className="agent-subagent-header group/label flex w-fit max-w-full items-center gap-1 rounded-[4px] py-px pr-1 transition-colors hover:bg-white/5 focus:outline-none"
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-blue-300" />
        <span className="agent-subagent-name font-mono text-xs font-bold text-blue-300">
          Subagent
        </span>
        <span className="agent-subagent-detail truncate text-xs text-white/50">{label}</span>
      </button>

      {/* 运行中：当前正在执行的内部工具（复用执行流程的工具标题格式）。 */}
      {currentStep ? (
        <div className="agent-subagent-running-row mt-1 flex min-w-0 items-start gap-1 pl-1 text-xs leading-relaxed text-white/45">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
          <div className="flex min-w-0 flex-1 items-center overflow-hidden">
            <ToolCallTitle
              toolContent={{ toolName: currentStep.toolName, args: currentStep.args }}
            />
          </div>
        </div>
      ) : countSegments.length > 0 || isError ? (
        /* 完成后：统计行（错误状态前置 Error 标记）。 */
        <div className="agent-subagent-stats-row mt-1 flex min-w-0 items-start gap-1 pl-1 text-xs text-white/50">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
          <span className="agent-subagent-stats flex min-w-0 flex-1 flex-wrap items-center leading-relaxed">
            {isError && (
              <span className="agent-subagent-error font-semibold text-red-400">Error</span>
            )}
            {countSegments.map((segment, index) => (
              <Fragment key={segment.plural}>
                {(index > 0 || isError) && <span className="px-1">·</span>}
                <span>{segment.count}</span>
                <span className="ml-0.5">
                  {segment.count === 1 ? segment.singular : segment.plural}
                </span>
              </Fragment>
            ))}
          </span>
        </div>
      ) : null}
    </div>
  )
}
