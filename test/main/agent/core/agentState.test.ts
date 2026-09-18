import type { AgentMessage, AssistantMessage } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { Agent } from "@/agent/core/agent"
import type { StreamFn } from "@/agent/core/types"

// 状态测试不触发流式请求：streamFn 仅占位。
const unusedStreamFn: StreamFn = () => {
  throw new Error("streamFn is not used in state tests")
}

const assistantMessage = (text: string): AssistantMessage => ({
  role: "assistant",
  content: [{ type: "text", text }],
  provider: "p",
  model: "m",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
  stopReason: "stop",
  timestamp: Date.now(),
})

const createAgent = (messages: AgentMessage[] = []): Agent =>
  new Agent({
    streamFn: unusedStreamFn,
    initialState: {
      systemPrompt: "system",
      model: { provider: "p", id: "m" },
      messages,
    },
  })

describe("Agent 状态变更契约（review F14）", () => {
  it("appendMessage 追加消息且 getter 同步可见", () => {
    const agent = createAgent()
    const message = assistantMessage("a")

    agent.state.appendMessage(message)

    expect(agent.state.messages).toEqual([message])
  })

  it("removeLastMessage 返回被移除消息并收缩状态；空数组返回 undefined", () => {
    const agent = createAgent()
    const first = assistantMessage("first")
    const second = assistantMessage("second")
    agent.state.appendMessage(first)
    agent.state.appendMessage(second)

    expect(agent.state.removeLastMessage()).toEqual(second)
    expect(agent.state.messages).toEqual([first])
    expect(agent.state.removeLastMessage()).toEqual(first)
    expect(agent.state.removeLastMessage()).toBeUndefined()
    expect(agent.state.messages).toEqual([])
  })

  it("构造时的 initialState.messages 被复制：外部后续变更不影响状态", () => {
    const source: AgentMessage[] = [assistantMessage("initial")]
    const agent = createAgent(source)

    source.push(assistantMessage("late"))

    expect(agent.state.messages).toHaveLength(1)
  })

  it("getter 返回快照副本：外部 push/pop 不污染内部状态，历史快照不随后续变更更新", () => {
    const agent = createAgent()
    agent.state.appendMessage(assistantMessage("internal"))

    const snapshot = agent.state.messages
    snapshot.push(assistantMessage("external"))
    expect(snapshot).toHaveLength(2)
    expect(agent.state.messages).toHaveLength(1)

    snapshot.pop()
    expect(snapshot).toHaveLength(1)
    expect(agent.state.messages).toHaveLength(1)

    agent.state.appendMessage(assistantMessage("late"))
    expect(snapshot).toHaveLength(1)
    expect(agent.state.messages).toHaveLength(2)
  })

  it("tools getter 返回快照副本：外部 push 不污染内部工具集", () => {
    const agent = createAgent()
    const tool = {
      name: "echo",
      label: "echo",
      description: "echo",
      inputSchema: { parse: (value: unknown) => value } as never,
      execute: async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
    }
    agent.state.tools = [tool]

    const snapshot = agent.state.tools
    snapshot.push({ ...tool, name: "injected" })

    expect(snapshot).toHaveLength(2)
    expect(agent.state.tools.map((item) => item.name)).toEqual(["echo"])
  })

  it("pendingToolCalls getter 返回副本：外部 add 不污染内部集合", () => {
    const agent = createAgent()

    const snapshot = agent.state.pendingToolCalls as Set<string>
    snapshot.add("call-x")

    expect(agent.state.pendingToolCalls.has("call-x")).toBe(false)
  })
})
