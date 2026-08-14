import type { AssistantMessage, SubagentData, Usage } from "@shared/contracts/agent"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { AgentTool } from "@/agent/core/types"
import { createTaskTool } from "@/agent/tools/task"

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, totalTokens: 0 }

const TEST_TOOL_SCHEMA = z.object({ path: z.string().optional() })

// 脚本化的 mock streamFn：逐次返回预设助手响应，避免真实 LLM 调用。
const holder = vi.hoisted(() => ({
  streamResponses: [] as AssistantMessage[],
}))

vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async () => {
      const response = holder.streamResponses.shift()
      if (!response) throw new Error("No more mock responses")
      const stream = createAssistantMessageEventStream()
      stream.push({ type: "start", partial: response })
      stream.push({ type: "done", reason: response.stopReason, message: response })
      stream.end()
      return stream
    },
  }
})

// 构造助手消息。
const assistant = (blocks: AssistantMessage["content"]): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "p",
  model: "m",
  usage: EMPTY_USAGE,
  stopReason: "stop",
  timestamp: 0,
})

// 构造工具调用块。
const toolCallBlock = (id: string, name: string, args: Record<string, unknown>) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
})

describe("task 子代理工具", () => {
  it("捕获内部工具步骤与完整快照，经 onUpdate 与结果回传", async () => {
    const executedCalls: { toolCallId: string; params: unknown }[] = []
    const mockTool: AgentTool<typeof TEST_TOOL_SCHEMA> = {
      name: "test_tool",
      label: "测试工具",
      description: "子代理内部工具",
      inputSchema: TEST_TOOL_SCHEMA,
      execute: async (toolCallId, params) => {
        executedCalls.push({ toolCallId, params })
        return { content: [{ type: "text", text: "工具结果 OK" }] }
      },
    }

    const tool = createTaskTool({
      systemPrompt: "父系统提示词",
      model: { provider: "p", id: "m" },
      beforeToolCall: async () => undefined,
      getSignal: () => undefined,
      recordChildCall: vi.fn(),
      getTools: () => [mockTool],
    })

    // 脚本子代理响应：先 toolCall 触发内部工具，再输出最终文本。
    holder.streamResponses.push(
      { ...assistant([toolCallBlock("inner-1", "test_tool", {})]), stopReason: "toolUse" },
      assistant([{ type: "text", text: "子代理任务完成" }]),
    )

    const updates: unknown[] = []
    const result = await tool.execute(
      "parent-call-1",
      { name: "查询列表", description: "列出当前目录", prompt: "请列出当前目录的文件" },
      undefined,
      (update) => updates.push(update),
    )

    // 内部工具确实被调用。
    expect(executedCalls).toHaveLength(1)
    expect(executedCalls[0]?.toolCallId).toBe("inner-1")

    // onUpdate 每次携带完整快照（含 name/description/prompt）。
    expect(updates.length).toBeGreaterThan(0)
    for (const update of updates) {
      const subagent = (update as { details?: { subagent?: SubagentData } }).details?.subagent
      expect(subagent?.name).toBe("查询列表")
      expect(subagent?.description).toBe("列出当前目录")
      expect(subagent?.prompt).toBe("请列出当前目录的文件")
    }

    // 最终结果 details.subagent 含完整上下文、内部步骤与聚合 usage。
    const subagent = (result.details as { subagent: SubagentData }).subagent
    expect(subagent.name).toBe("查询列表")
    expect(subagent.messages.some((message) => message.role === "assistant")).toBe(true)
    expect(subagent.steps).toEqual([
      { toolName: "test_tool", args: {}, status: "done", result: "工具结果 OK" },
    ])
    expect(subagent.usage.totalTokens).toBe(0)
    // 最终文本有界回传。
    expect(result.content[0]?.type).toBe("text")
  })

  it("未提供 name 时回退 task，工具执行出错记 error 步骤", async () => {
    const failingTool: AgentTool<typeof TEST_TOOL_SCHEMA> = {
      name: "fail_tool",
      label: "失败工具",
      description: "抛错工具",
      inputSchema: TEST_TOOL_SCHEMA,
      execute: async () => {
        throw new Error("boom")
      },
    }

    const tool = createTaskTool({
      systemPrompt: "父系统提示词",
      model: { provider: "p", id: "m" },
      beforeToolCall: async () => undefined,
      getSignal: () => undefined,
      recordChildCall: vi.fn(),
      getTools: () => [failingTool],
    })

    holder.streamResponses.push(
      { ...assistant([toolCallBlock("inner-2", "fail_tool", {})]), stopReason: "toolUse" },
      assistant([{ type: "text", text: "失败后总结" }]),
    )

    const result = await tool.execute("parent-call-2", {
      description: "会失败",
      prompt: "执行失败的工具",
    })

    const subagent = (result.details as { subagent: SubagentData }).subagent
    expect(subagent.name).toBe("task")
    expect(subagent.steps).toEqual([
      { toolName: "fail_tool", args: {}, status: "error", result: expect.stringContaining("boom") },
    ])
  })
})
