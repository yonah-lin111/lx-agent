import { useCallback, useMemo, useRef, useState } from "react"
import { resolveSubagentDisplayStatus } from "@/features/agent/components/blocks/SubagentStatusRow"
import type { ChatBlock, ExecutionStep } from "@/features/agent/types"

/**
 * 子代理详情面板：选中步骤、面板滚动容器与开关回调。
 * 只保存选中的步骤 ID 与批量下标，面板数据从当前步骤列表实时派生，子代理流式快照更新时面板同步刷新。
 */
export const useFlowSubagentPanel = (
  steps: ExecutionStep[],
): {
  activeSubagentToolCall: Extract<ChatBlock, { kind: "toolCall" }> | null
  handleOpenSubagent: (stepId: string, subagentIndex?: number) => void
  handleCloseSubagent: () => void
  subagentScrollRef: React.RefObject<HTMLDivElement | null>
} => {
  // 当前选中的 Subagent 步骤 ID 与批量扇出下标（对应 AgentSubagentPanel 的 toolCall 参数来源）。
  const [selection, setSelection] = useState<{ stepId: string; subagentIndex: number } | null>(null)
  const subagentScrollRef = useRef<HTMLDivElement>(null)

  // 从实时步骤列表解析选中的 Subagent 内容，转换为 AgentSubagentPanel 所需的 ToolCallBlock 格式。
  const activeSubagentToolCall = useMemo<Extract<ChatBlock, { kind: "toolCall" }> | null>(() => {
    if (!selection) return null
    const step = steps.find((item) => item.id === selection.stepId)
    const content = step?.subagentContent
    if (!step || !content) return null
    // 批量扇出：按选中下标定位快照；单项子代理直接取 subagent。
    const batch = content.subagents
    const subagent =
      batch && batch.length > 0
        ? batch[Math.min(Math.max(selection.subagentIndex, 0), batch.length - 1)]
        : content.subagent
    if (!subagent) return null
    return {
      kind: "toolCall",
      toolCallId: step.toolContent?.toolCallId || subagent.subagentId || "flow-subagent-detail",
      toolName: step.toolContent?.toolName || "task",
      args: {
        description: subagent.description || "",
        prompt: subagent.prompt || "",
      },
      // 单项终态优先：批量扇出下面板按各自完成收敛 loading。
      status: resolveSubagentDisplayStatus(subagent, step.status),
      subagent,
    }
  }, [selection, steps])

  const handleOpenSubagent = useCallback((stepId: string, subagentIndex = 0): void => {
    setSelection({ stepId, subagentIndex })
  }, [])

  const handleCloseSubagent = useCallback((): void => {
    setSelection(null)
  }, [])

  return { activeSubagentToolCall, handleOpenSubagent, handleCloseSubagent, subagentScrollRef }
}
