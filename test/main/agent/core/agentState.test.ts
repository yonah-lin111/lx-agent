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

  it("getter 返回内部数组（文档化只读契约）：append/remove 后同一引用反映最新状态", () => {
    const agent = createAgent()
    const reference = agent.state.messages

    agent.state.appendMessage(assistantMessage("x"))
    expect(reference).toBe(agent.state.messages)
    expect(reference).toHaveLength(1)

    agent.state.removeLastMessage()
    expect(reference).toHaveLength(0)
  })
})
