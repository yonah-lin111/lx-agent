import type { AgentMessage, HookContextMessage } from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { Agent } from "@/agent/core/agent"
import type { StreamFn } from "@/agent/core/types"

// 不参与转换的占位 streamFn（仅构造 Agent 用）。
const unusedStream: StreamFn = () => {
  throw new Error("unused")
}

const createAgent = (): Agent => new Agent({ streamFn: unusedStream })

const hookMessage = (text: string): HookContextMessage => ({
  role: "hookContext",
  event: "PreToolUse",
  hookName: "policy",
  status: "blocked",
  text,
  durationMs: 3,
  timestamp: 1,
})

describe("defaultConvertToLlm hookContext 映射", () => {
  it("非空 text 映射为 <hook_context> user 文本", async () => {
    const agent = createAgent()
    const converted = await agent.convertToLlm([hookMessage("rm -rf denied")])
    expect(converted).toEqual([
      {
        role: "user",
        content:
          '<hook_context event="PreToolUse" hook="policy" status="blocked">\nrm -rf denied\n</hook_context>',
      },
    ])
  })

  it("空/空白 text 不产生 LLM 消息（零 token 注入）", async () => {
    const agent = createAgent()
    expect(await agent.convertToLlm([hookMessage("")])).toEqual([])
    expect(await agent.convertToLlm([hookMessage("   \n")])).toEqual([])
  })

  it("与标准消息混排时顺序不变", async () => {
    const agent = createAgent()
    const messages: AgentMessage[] = [
      { role: "user", content: "hi", timestamp: 1 },
      hookMessage("ctx"),
      {
        role: "toolResult",
        toolCallId: "t1",
        toolName: "bash",
        content: [{ type: "text", text: "out" }],
        isError: false,
        timestamp: 2,
      },
    ]
    const converted = await agent.convertToLlm(messages)
    expect(converted.map((message) => message.role)).toEqual(["user", "user", "toolResult"])
    expect(typeof converted[1] === "object" && "content" in converted[1]).toBe(true)
  })
})
