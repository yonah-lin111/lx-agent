import { useCallback, useMemo, useRef, useState } from "react"
import type { ChatBlock, ExecutionStep } from "@/features/agent/types"

/**
 * 子代理详情面板：选中步骤、面板滚动容器与开关回调。
 * 只保存选中的步骤 ID，面板数据从当前步骤列表实时派生，子代理流式快照更新时面板同步刷新。
 */
export const useFlowSubagentPanel = (
  steps: ExecutionStep[],
): {
  activeSubagentToolCall: Extract<ChatBlock, { kind: "toolCall" }> | null
  handleOpenSubagent: (stepId: string) => void
  handleCloseSubagent: () => void
  subagentScrollRef: React.RefObject<HTMLDivElement | null>
} => {
  // 当前选中的 Subagent 步骤 ID（对应 AgentSubagentPanel 的 toolCall 参数来源）
  const [activeSubagentStepId, setActiveSubagentStepId] = useState<string | null>(null)
  const subagentScrollRef = useRef<HTMLDivElement>(null)

  // 从实时步骤列表解析选中的 Subagent 内容，转换为 AgentSubagentPanel 所需的 ToolCallBlock 格式
  const activeSubagentToolCall = useMemo<Extract<ChatBlock, { kind: "toolCall" }> | null>(() => {
    if (!activeSubagentStepId) return null
    const step = steps.find((item) => item.id === activeSubagentStepId)
    const content = step?.subagentContent
    if (!step || !content) return null
    return {
      kind: "toolCall",
      toolCallId:
        step.toolContent?.toolCallId || content.subagent?.subagentId || "flow-subagent-detail",
      toolName: step.toolContent?.toolName || "task",
      args: {
        description: content.subagent?.description || "",
        prompt: content.subagent?.prompt || "",
      },
      status: step.status,
      subagent: content.subagent,
    }
  }, [activeSubagentStepId, steps])

  const handleOpenSubagent = useCallback((stepId: string) => {
    setActiveSubagentStepId(stepId)
  }, [])

  const handleCloseSubagent = useCallback(() => {
    setActiveSubagentStepId(null)
  }, [])

  return { activeSubagentToolCall, handleOpenSubagent, handleCloseSubagent, subagentScrollRef }
}
