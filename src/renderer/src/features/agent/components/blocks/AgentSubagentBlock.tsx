import { Bot } from "lucide-react"
import type React from "react"
import type { ChatBlock } from "@/features/agent/types"
import { formatSubagentLabel } from "@/features/agent/utils/subagentLabel"
import { useTranslation } from "@/i18n"
import { type SubagentDisplayStatus, SubagentStatusRow } from "./SubagentStatusRow"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 工具结果块类型。
type ToolResultBlock = Extract<ChatBlock, { kind: "toolResult" }>

// 子代理调用展示组件属性类型。
interface AgentSubagentBlockProps {
  // 子代理（task 工具）调用。
  toolCall: ToolCallBlock
  // 配对的工具结果（存在即代表子代理已结束；恢复会话时 toolCall.status 恒为 running，不能作为完成依据）。
  toolResult?: ToolResultBlock
  // 点击顶部 label 打开子代理面板弹窗；批量扇出时携带子代理下标。
  onOpen?: (toolCall: ToolCallBlock, subagentIndex?: number) => void
}

// 提取子代理名（缺失/非法时兜底 "task"）。
const getSubagentName = (toolCall: ToolCallBlock): string =>
  toolCall.subagent?.name?.trim() || "task"

/**
 * AgentSubagentBlock - 渲染子代理（task 工具）调用：名称（点击打开面板）+
 * 运行中的当前内部工具 / 完成后的调用统计行（失败状态前置 Error 标记）。
 */
export const AgentSubagentBlock = ({
  toolCall,
  toolResult,
  onOpen,
}: AgentSubagentBlockProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  if (!toolCall) return null

  const subagent = toolCall.subagent
  const batch = toolCall.subagents && toolCall.subagents.length > 0 ? toolCall.subagents : undefined
  // 完成状态以配对的 toolResult 为准，实时流期间回退到块自身状态。
  const status: SubagentDisplayStatus = toolResult
    ? toolResult.isError
      ? "error"
      : "done"
    : toolCall.status

  // 批量扇出（tasks[]）：逐项渲染入口，点击某项打开该子代理自己的面板（面板按 index 定位快照）。
  if (batch) {
    return (
      <div className="agent-subagent-block my-0.5 flex min-w-0 flex-col gap-1">
        {batch.map((item, index) => {
          const itemName = item.name.trim() || "task"
          const itemLabel = formatSubagentLabel(itemName, item.roleName)
          return (
            <div key={item.subagentId ?? `${index}`} className="min-w-0">
              <button
                type="button"
                aria-label={t("agent.viewSubagentDetails")}
                onClick={() => onOpen?.(toolCall, index)}
                className="agent-subagent-header group/label flex w-fit max-w-full items-center gap-1 rounded-[4px] py-px pr-1 transition-colors hover:bg-white/5 focus:outline-none"
              >
                <Bot className="h-3.5 w-3.5 shrink-0 text-blue-300" />
                <span className="agent-subagent-name font-mono text-xs font-bold text-blue-300">
                  Subagent
                </span>
                <span className="agent-subagent-detail truncate text-xs text-white/50">
                  {itemLabel}
                </span>
              </button>
              <SubagentStatusRow
                subagent={item}
                status={status}
                testId="agent-subagent-status-row"
                className="agent-subagent-status-row mt-1"
              />
            </div>
          )
        })}
      </div>
    )
  }

  const name = getSubagentName(toolCall)
  const label = formatSubagentLabel(name, subagent?.roleName)

  return (
    <div className="agent-subagent-block my-0.5 min-w-0">
      {/* 顶部 label：Subagent 名称 + 子代理名（AI 分发时注明原始名称），点击打开面板。 */}
      <button
        type="button"
        aria-label={t("agent.viewSubagentDetails")}
        onClick={() => onOpen?.(toolCall)}
        className="agent-subagent-header group/label flex w-fit max-w-full items-center gap-1 rounded-[4px] py-px pr-1 transition-colors hover:bg-white/5 focus:outline-none"
      >
        <Bot className="h-3.5 w-3.5 shrink-0 text-blue-300" />
        <span className="agent-subagent-name font-mono text-xs font-bold text-blue-300">
          Subagent
        </span>
        <span className="agent-subagent-detail truncate text-xs text-white/50">{label}</span>
      </button>

      {/* 状态行：运行中显示当前内部工具，完成后显示调用统计。 */}
      <SubagentStatusRow
        subagent={subagent}
        status={status}
        testId="agent-subagent-status-row"
        className="agent-subagent-status-row mt-1"
      />
    </div>
  )
}
