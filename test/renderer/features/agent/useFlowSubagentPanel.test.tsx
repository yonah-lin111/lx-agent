// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useFlowSubagentPanel } from "@/features/agent/components/AgentExecutionFlowList/hooks/useFlowSubagentPanel"
import type { ExecutionStep, SubagentData } from "@/features/agent/types"

// 子代理快照数据（同一 subagentId 的两次调用）。
const buildSubagent = (description: string): SubagentData => ({
  subagentId: "subagent-1789745938515-f9b34",
  name: "protocol-test",
  description,
  prompt: description,
  communications: [],
  messages: [],
  steps: [],
  usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
})

// 子代理执行步骤（toolContent.toolCallId 为调用唯一标识）。
const buildStep = (stepId: string, toolCallId: string, description: string): ExecutionStep => ({
  id: stepId,
  turnIndex: 1,
  stepIndex: 1,
  kind: "subagent",
  title: "protocol-test",
  status: "done",
  subagentContent: { name: "protocol-test", subagent: buildSubagent(description) },
  toolContent: { toolName: "task", toolCallId, args: {}, result: "" },
})

describe("useFlowSubagentPanel", () => {
  it("同 id 子代理的不同调用步骤使用各自 toolCallId 作为面板标识", () => {
    const steps = [
      buildStep("step-1", "call-1", "第一次调用"),
      buildStep("step-2", "call-2", "第二次调用"),
    ]
    const { result } = renderHook(() => useFlowSubagentPanel(steps))

    act(() => result.current.handleOpenSubagent("step-2"))
    expect(result.current.activeSubagentToolCall?.toolCallId).toBe("call-2")
    expect(result.current.activeSubagentToolCall?.subagent?.description).toBe("第二次调用")

    act(() => result.current.handleOpenSubagent("step-1"))
    expect(result.current.activeSubagentToolCall?.toolCallId).toBe("call-1")

    act(() => result.current.handleCloseSubagent())
    expect(result.current.activeSubagentToolCall).toBeNull()
  })
})
