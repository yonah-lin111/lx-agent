import { Bot } from "lucide-react"
import type React from "react"
import type { ExecutionSubagentContent } from "@/features/agent/types"
import { formatSubagentLabel } from "@/features/agent/utils/subagentLabel"
import { useTranslation } from "@/i18n"

export interface FlowItemSubagentContentProps {
  content: ExecutionSubagentContent
  // 批量扇出（tasks[]）：点击某项打开对应子代理面板（下标定位快照）。
  onOpenSubagentItem?: (subagentIndex: number) => void
}

export const FlowItemSubagentContent = ({
  content,
  onOpenSubagentItem,
}: FlowItemSubagentContentProps): React.JSX.Element => {
  const { t } = useTranslation()
  const batch = content.subagents && content.subagents.length > 0 ? content.subagents : undefined

  return (
    <div className="agent-execution-flow-subagent-content flex flex-col gap-2 font-mono text-xs">
      <div className="flex items-center gap-2 text-white/70">
        <span className="text-white/40">Task:</span>
        <span className="font-bold text-blue-300">{content.name}</span>
      </div>
      {batch && (
        <div className="agent-execution-flow-subagent-batch flex flex-col gap-1">
          {batch.map((item, index) => (
            <button
              key={item.subagentId ?? `${index}`}
              type="button"
              aria-label={t("agent.viewSubagentDetails")}
              onClick={(event) => {
                event.stopPropagation()
                onOpenSubagentItem?.(index)
              }}
              className="flex w-fit max-w-full items-center gap-1 rounded-[4px] px-1 py-px text-left transition-colors hover:bg-white/5 focus:outline-none"
            >
              <Bot className="h-3.5 w-3.5 shrink-0 text-blue-300" />
              <span className="truncate text-blue-300">
                {formatSubagentLabel(item.name.trim() || "task", item.roleName)}
              </span>
            </button>
          ))}
        </div>
      )}
      {content.subagent?.prompt && (
        <div className="rounded bg-black/30 p-2 text-white/80">
          <div className="text-xs text-white/40 mb-0.5">Prompt:</div>
          <div className="whitespace-pre-wrap">{content.subagent.prompt}</div>
        </div>
      )}
      {content.subagent?.description && (
        <div className="text-white/50">{content.subagent.description}</div>
      )}
      {content.subagent?.usage && (
        <div className="flex gap-3 text-white/40 pt-1">
          <span>Input: {content.subagent.usage.input}</span>
          <span>Output: {content.subagent.usage.output}</span>
          <span>Total: {content.subagent.usage.totalTokens}</span>
        </div>
      )}
    </div>
  )
}
