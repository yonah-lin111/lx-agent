import { Bot, CornerDownRight } from "lucide-react"
import type React from "react"
import { Fragment } from "react"
import type { AgentMessage, ChatBlock, SubagentStep } from "@/features/agent/types"

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
  if (toolName.includes("_")) return "mcp"
  return "tool"
}

// 提取子代理名（缺失/非法时兜底 "task"）。
const getSubagentName = (toolCall: ToolCallBlock): string =>
  toolCall.subagent?.name?.trim() || "task"

// 提取子代理任务描述（快照优先，回退 args；缺失/非法时兜底）。
const getTaskDescription = (toolCall: ToolCallBlock): string => {
  const snapshot = toolCall.subagent?.description
  if (snapshot && snapshot.trim()) return snapshot
  const argsDescription = toolCall.args.description
  return typeof argsDescription === "string" && argsDescription.trim() ? argsDescription : "task"
}

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
    .reduce(
      (count, message) =>
        count + message.content.filter((block) => block.type === "thinking").length,
      0,
    ) ?? 0

// 子代理状态展示（Idle / Working / Done / Error，英文文本 + 状态色）。
type SubagentStatus = {
  label: string
  labelClass: string
}

const getSubagentStatus = (toolCall: ToolCallBlock): SubagentStatus => {
  if (toolCall.status === "error") {
    return { label: "Error", labelClass: "text-red-400" }
  }
  if (toolCall.status === "running") {
    return { label: "Working", labelClass: "text-blue-300" }
  }
  // done：已产出快照（执行完成）→ Done；否则为模型已声明调用但尚未执行 → Idle。
  if (toolCall.subagent) {
    return { label: "Done", labelClass: "text-emerald-300" }
  }
  return { label: "Idle", labelClass: "text-white/40" }
}

/**
 * AgentSubagentBlock - 渲染子代理（task 工具）调用，展示名称、任务描述、内部统计与当前状态，
 * 不参与普通工具折叠（独立展示，与 write/skill 同级）；点击顶部 label 打开子代理面板弹窗。
 */
export const AgentSubagentBlock = ({
  toolCall,
  onOpen,
}: AgentSubagentBlockProps): React.JSX.Element | null => {
  if (!toolCall) return null

  const name = getSubagentName(toolCall)
  const description = getTaskDescription(toolCall)
  const subagent = toolCall.subagent
  const steps = subagent?.steps ?? []
  const thinkingCount = countThinking(subagent?.messages)
  const { tool: toolCount, mcp: mcpCount, webSearch: webSearchCount } = countSteps(steps)
  const countSegments = [
    { count: toolCount, singular: "Tool Call", plural: "Tool Calls" },
    { count: thinkingCount, singular: "Thought", plural: "Thoughts" },
    { count: mcpCount, singular: "MCP Call", plural: "MCP Calls" },
    { count: webSearchCount, singular: "Web Search", plural: "Web Searches" },
  ].filter((segment) => segment.count > 0)
  const status = getSubagentStatus(toolCall)

  return (
    <div className="agent-subagent-block my-0.5 min-w-0">
      {/* 顶部 label：Subagent 名称 + 子代理名（AI 分发时注明原始名称），点击打开面板。 */}
      <button
        type="button"
        aria-label={`查看子代理 ${name} 详情`}
        onClick={() => onOpen?.(toolCall)}
        className="agent-subagent-header group/label flex w-fit max-w-full items-center gap-1 rounded-[4px] py-px pr-1 transition-colors hover:bg-white/5 focus:outline-none"
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-blue-300" />
        <span className="agent-subagent-name font-mono text-[12px] font-bold text-blue-300">
          Subagent
        </span>
        <span className="agent-subagent-detail truncate text-[12px] text-white/50">
          {name !== "task" ? ` - ${name}(task)` : " - task"}
        </span>
      </button>

      {/* 第一个直角 icon：任务描述。 */}
      <div className="agent-subagent-desc-row mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
        <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
        <span className="agent-subagent-desc min-w-0 break-all">{description}</span>
      </div>

      {/* 第二个直角 icon：内部工具/思考/MCP 调用统计（静态展示，可换行）。 */}
      {countSegments.length > 0 && (
        <div className="agent-subagent-stats-row mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] text-white/50">
          <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
          <span className="agent-subagent-stats flex min-w-0 flex-1 flex-wrap items-center leading-relaxed">
            {countSegments.map((segment, index) => (
              <Fragment key={segment.plural}>
                {index > 0 && <span className="px-1">·</span>}
                <span>{segment.count}</span>
                <span className="ml-0.5">
                  {segment.count === 1 ? segment.singular : segment.plural}
                </span>
              </Fragment>
            ))}
          </span>
        </div>
      )}

      {/* 第三个直角 icon：当前状态（Idle / Working / Done / Error）。 */}
      <div className="agent-subagent-status-row mt-1 flex items-start gap-1 pl-1 text-[12px]">
        <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
        <span className={`agent-subagent-status flex h-5 items-center ${status.labelClass}`}>
          {status.label}
        </span>
      </div>
    </div>
  )
}
