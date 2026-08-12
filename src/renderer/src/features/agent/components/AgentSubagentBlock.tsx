import { Bot, CornerDownRight } from "lucide-react"
import type React from "react"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 子代理调用展示组件属性类型。
interface AgentSubagentBlockProps {
  // 子代理（task 工具）调用。
  toolCall: ToolCallBlock
}

// 提取子代理任务描述（缺失或非法时兜底）。
const getTaskDescription = (args: Record<string, unknown>): string => {
  const description = args.description
  return typeof description === "string" && description.trim() ? description : "task"
}

/**
 * AgentSubagentBlock - 渲染子代理（task 工具）调用，展示任务描述与流式执行进度，
 * 不参与普通工具折叠（独立展示，与 write/skill 同级）。
 */
export const AgentSubagentBlock = ({
  toolCall,
}: AgentSubagentBlockProps): React.JSX.Element | null => {
  if (!toolCall) return null

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <Bot className="h-3.5 w-3.5 shrink-0 text-blue-300" />
        <span className="font-mono text-[12px] font-bold text-blue-300">Subagent</span>
      </div>
      <div className="mt-1 flex min-w-0 items-start gap-1 pl-1 text-[12px] leading-relaxed text-white/45">
        <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
        <span className="min-w-0 break-all">{getTaskDescription(toolCall.args)}</span>
      </div>
      {toolCall.progress && (
        <div className="mt-1 max-h-24 overflow-y-auto rounded-[4px] border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] leading-relaxed text-white/50 whitespace-pre-wrap break-all">
          {toolCall.progress}
        </div>
      )}
    </div>
  )
}
