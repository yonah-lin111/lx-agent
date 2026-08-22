import { CornerDownRight, Sparkles } from "lucide-react"
import type React from "react"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// Skill 调用展示组件属性类型。
type AgentSkillCallBlockProps = {
  // 连续执行的 Skill 调用。
  toolCalls: ToolCallBlock[]
}

// 获取 Skill 的显示名称。
const getSkillName = (args: Record<string, unknown>): string => {
  const name = args.name
  return typeof name === "string" && name.trim() ? name : "Unknown skill"
}

/**
 * AgentSkillCallBlock - 渲染 Skill 调用名称，不展示 Skill 内容，不参与普通工具折叠。
 */
export const AgentSkillCallBlock = ({
  toolCalls,
}: AgentSkillCallBlockProps): React.JSX.Element | null => {
  if (toolCalls.length === 0) return null

  return (
    <div className="agent-skill-call-block my-0.5 min-w-0">
      <div className="agent-skill-header flex items-center gap-1">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-300" />
        <span className="agent-skill-name font-mono text-[12px] font-bold text-violet-300">
          Load_skill
        </span>
      </div>
      <div className="mt-1 flex min-w-0 flex-col gap-1 pl-1">
        {toolCalls.map((call) => (
          <div
            key={call.toolCallId}
            className="agent-skill-item-row flex min-w-0 items-start gap-1 text-[12px] leading-relaxed text-white/45"
          >
            <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0" />
            <span className="agent-skill-item-name min-w-0 break-all font-mono">
              {getSkillName(call.args)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
