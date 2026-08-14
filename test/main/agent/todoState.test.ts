import type { TodoList } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { Agent } from "@/agent/core/agent"

// 最小 streamFn（convertToLlm 直测不需要真实流；构造 Agent 仅用其默认转换器）。
const stubStreamFn = (async () => ({}) as never) as unknown as ConstructorParameters<
  typeof Agent
>[0]["streamFn"]

const createAgent = (): Agent =>
  new Agent({ streamFn: stubStreamFn, initialState: { systemPrompt: "" } })

describe("todoState → LLM 消息映射", () => {
  const todos: TodoList = [
    { content: "读取现有配置", status: "completed" },
    { content: "实现 todowrite 工具", status: "in_progress" },
  ]

  it("todoState 映射为带 [任务清单] 标记的 user 文本（不进协议角色）", async () => {
    const agent = createAgent()
    const llm = await agent.convertToLlm([
      {
        role: "todoState",
        todos,
        timestamp: 1,
      },
    ])
    expect(llm).toHaveLength(1)
    expect(llm[0]).toMatchObject({ role: "user" })
    expect(llm[0].content).toContain("[任务清单]")
    expect(llm[0].content).toContain("#1 [completed] 读取现有配置")
    expect(llm[0].content).toContain("#2 [in_progress] 实现 todowrite 工具")
  })

  it("todoState 与 compactionSummary 共存时各自映射为独立 user 块", async () => {
    const agent = createAgent()
    const llm = await agent.convertToLlm([
      {
        role: "todoState",
        todos,
        timestamp: 1,
      },
      {
        role: "compactionSummary",
        summary: "早期历史摘要",
        tokensBefore: 1200,
        timestamp: 2,
        manual: true,
      },
      { role: "user", content: "继续", timestamp: 3 },
    ])
    expect(llm).toHaveLength(3)
    expect(llm.map((m) => m.content)).toEqual([
      expect.stringContaining("[任务清单]"),
      expect.stringContaining("[上下文压缩摘要]"),
      "继续",
    ])
  })
})
