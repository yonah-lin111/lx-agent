import { describe, expect, it } from "vitest"
import { z } from "zod"
import type { AgentTool, LlmMessage } from "@/agent/core/types"
import { toAiTools, toModelMessages } from "@/agent/stream/toModelMessages"

// 构造 LlmMessage 列表：user + 带工具调用的 assistant + toolResult。
const buildMessages = (): LlmMessage[] => [
  { role: "user", content: "你好" },
  {
    role: "assistant",
    content: [
      { type: "text", text: "我来读取" },
      { type: "toolCall", id: "call-1", name: "read", arguments: { path: "src/index.ts" } },
    ],
  },
  {
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "read",
    content: [{ type: "text", text: "文件内容" }],
    isError: false,
  },
]

describe("toModelMessages", () => {
  it("user 消息转为 AI SDK user 消息", () => {
    const result = toModelMessages([{ role: "user", content: "你好" }])
    expect(result).toEqual([{ role: "user", content: "你好" }])
  })

  it("assistant 消息内容块映射为 text/reasoning/tool-call part", () => {
    const messages: LlmMessage[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "文本" },
          { type: "thinking", thinking: "思考" },
          { type: "toolCall", id: "call-1", name: "read", arguments: { path: "a.ts" } },
        ],
      },
    ]
    const result = toModelMessages(messages)
    const assistant = result[0]

    expect(assistant?.role).toBe("assistant")
    expect(assistant).toMatchObject({
      content: [
        { type: "text", text: "文本" },
        { type: "reasoning", text: "思考" },
        { type: "tool-call", toolCallId: "call-1", toolName: "read", input: { path: "a.ts" } },
      ],
    })
  })

  it("tool-call part 使用 input 字段承载参数（AI SDK schema 要求）", () => {
    const result = toModelMessages(buildMessages())
    const assistant = result[1]

    expect(assistant?.role).toBe("assistant")
    const toolCallPart = (assistant as { content: Array<Record<string, unknown>> }).content.find(
      (part) => part.type === "tool-call",
    )
    expect(toolCallPart).toBeDefined()
    expect(toolCallPart).toHaveProperty("input", { path: "src/index.ts" })
    expect(toolCallPart).not.toHaveProperty("args")
  })

  it("toolResult 消息转为 AI SDK tool 消息且 output 为 text 结构", () => {
    const result = toModelMessages([buildMessages()[2]!])

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "read",
          output: { type: "text", value: "文件内容" },
        },
      ],
    })
  })

  it("image 内容块转为 data URL image part", () => {
    const result = toModelMessages([
      { role: "user", content: [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }] },
    ])

    expect(result[0]).toEqual({
      role: "user",
      content: [{ type: "image", image: "data:image/png;base64,aGVsbG8=" }],
    })
  })
})

describe("toAiTools", () => {
  it("空工具集返回 undefined", () => {
    expect(toAiTools(undefined)).toBeUndefined()
    expect(toAiTools([])).toBeUndefined()
  })

  it("工具转为 AI SDK tool 定义（含 description 与 inputSchema）", () => {
    const tool: AgentTool<z.ZodType<{ path: string }>> = {
      name: "read",
      label: "读取文件",
      description: "读取文件",
      inputSchema: z.object({ path: z.string() }),
      execute: async () => ({ content: [] }),
    }

    const result = toAiTools([tool])
    expect(result).toBeDefined()
    expect(Object.keys(result ?? {})).toEqual(["read"])
    const def = result?.["read"]
    expect(def).toMatchObject({ description: "读取文件" })
    expect(def?.inputSchema).toBeDefined()
  })
})
