import { useCallback, useMemo, useRef, useState } from "react"
import type { ChatBlock, ExecutionSubagentContent } from "@/features/agent/types"

/**
 * 子代理详情面板：选中内容、面板滚动容器与开关回调。
 */
export const useFlowSubagentPanel = (): {
  activeSubagentToolCall: Extract<ChatBlock, { kind: "toolCall" }> | null
  handleOpenSubagent: (content: ExecutionSubagentContent) => void
  handleCloseSubagent: () => void
  subagentScrollRef: React.RefObject<HTMLDivElement | null>
} => {
  // 当前选中的 Subagent 详情展示对象（对应 AgentSubagentPanel 的 toolCall 参数）
  const [activeSubagentContent, setActiveSubagentContent] =
    useState<ExecutionSubagentContent | null>(null)
  const subagentScrollRef = useRef<HTMLDivElement>(null)

  // 转换选中的 SubagentContent 为 AgentSubagentPanel 所需的 ToolCallBlock 格式
  const activeSubagentToolCall = useMemo<Extract<ChatBlock, { kind: "toolCall" }> | null>(() => {
    if (!activeSubagentContent) return null
    return {
      kind: "toolCall",
      toolCallId: activeSubagentContent.subagent?.subagentId || "flow-subagent-detail",
      toolName: "task",
      args: {
        description: activeSubagentContent.subagent?.description || "",
        prompt: activeSubagentContent.subagent?.prompt || "",
      },
      status: "done",
      subagent: activeSubagentContent.subagent,
    }
  }, [activeSubagentContent])

  const handleOpenSubagent = useCallback((content: ExecutionSubagentContent) => {
    setActiveSubagentContent(content)
  }, [])

  const handleCloseSubagent = useCallback(() => {
    setActiveSubagentContent(null)
  }, [])

  return { activeSubagentToolCall, handleOpenSubagent, handleCloseSubagent, subagentScrollRef }
}
