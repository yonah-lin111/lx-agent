import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

  it("含图片的 toolResult 转为 text 工具结果 + 紧随的 user 图片消息（跨 Provider 兼容）", () => {
    const result = toModelMessages([
      {
        role: "toolResult",
        toolCallId: "call-img",
        toolName: "view_image",
        content: [
          { type: "text", text: "Viewed image /repo/shot.png" },
          { type: "image", data: "aW1n", mimeType: "image/png" },
        ],
        isError: false,
        image: {
          path: "/repo/shot.png",
          mimeType: "image/png",
          detail: "high",
          width: 100,
          height: 50,
          sourceWidth: 100,
          sourceHeight: 50,
          resized: false,
          sizeBytes: 3,
        },
      } as any,
    ])

    // 工具结果仅回文本（图片不进入 tool-result output，避免被 Provider JSON 序列化丢失）。
    expect(result[0]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-img",
          toolName: "view_image",
          output: { type: "text", value: "Viewed image /repo/shot.png\n[image: image/png]" },
        },
      ],
    })
    // 图片以 user 图片消息紧随工具结果投递。
    expect(result[1]).toEqual({
      role: "user",
      content: [
        { type: "text", text: 'Image from tool "view_image" (/repo/shot.png):' },
        { type: "image", image: "data:image/png;base64,aW1n" },
      ],
    })
  })

  it("无 image details 的图片工具结果不追加路径提示", () => {
    const result = toModelMessages([
      {
        role: "toolResult",
        toolCallId: "call-img",
        toolName: "view_image",
        content: [{ type: "image", data: "aW1n", mimeType: "image/png" }],
        isError: false,
      },
    ])

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      role: "user",
      content: [
        { type: "text", text: 'Image from tool "view_image":' },
        { type: "image", image: "data:image/png;base64,aW1n" },
      ],
    })
  })

  it("纯文本 toolResult 仍为 text 结构（不引入 content parts）", () => {
    const result = toModelMessages([
      {
        role: "toolResult",
        toolCallId: "call-txt",
        toolName: "read",
        content: [{ type: "text", text: "内容" }],
        isError: false,
      },
    ])

    expect(result[0]).toMatchObject({
      content: [{ output: { type: "text", value: "内容" } }],
    })
  })

  it("并行工具调用的多条 toolResult：tool 消息保持连续，图片合并为一条 user 消息", () => {
    const result = toModelMessages([
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "c1", name: "view_image", arguments: { path: "a.png" } },
          { type: "toolCall", id: "c2", name: "view_image", arguments: { path: "b.png" } },
        ],
      } as any,
      {
        role: "toolResult",
        toolCallId: "c1",
        toolName: "view_image",
        content: [
          { type: "text", text: "Viewed image /repo/a.png" },
          { type: "image", data: "YQ==", mimeType: "image/png" },
        ],
        isError: false,
        image: { path: "/repo/a.png" },
      } as any,
      {
        role: "toolResult",
        toolCallId: "c2",
        toolName: "view_image",
        content: [
          { type: "text", text: "Viewed image /repo/b.png" },
          { type: "image", data: "Yg==", mimeType: "image/png" },
        ],
        isError: false,
        image: { path: "/repo/b.png" },
      } as any,
    ])

    // assistant → tool → tool → user（图片合并到整段工具结果之后）
    expect(result.map((message) => message.role)).toEqual(["assistant", "tool", "tool", "user"])
    expect(result[3]).toEqual({
      role: "user",
      content: [
        { type: "text", text: 'Image from tool "view_image" (/repo/a.png):' },
        { type: "image", image: "data:image/png;base64,YQ==" },
        { type: "text", text: 'Image from tool "view_image" (/repo/b.png):' },
        { type: "image", image: "data:image/png;base64,Yg==" },
      ],
    })
  })

  it("并行工具调用中仅部分结果带图片时仍只追加一条图片消息", () => {
    const result = toModelMessages([
      {
        role: "toolResult",
        toolCallId: "c1",
        toolName: "view_image",
        content: [{ type: "image", data: "YQ==", mimeType: "image/png" }],
        isError: false,
      } as any,
      {
        role: "toolResult",
        toolCallId: "c2",
        toolName: "read",
        content: [{ type: "text", text: "file content" }],
        isError: false,
      },
    ])

    expect(result.map((message) => message.role)).toEqual(["tool", "tool", "user"])
    expect(result[2]).toMatchObject({
      role: "user",
      content: [
        { type: "text", text: 'Image from tool "view_image":' },
        { type: "image", image: "data:image/png;base64,YQ==" },
      ],
    })
  })

  it("user 消息携带图片附件时，只注入 view_image 路径提示（不内联图片）", () => {
    const result = toModelMessages([
      {
        role: "user",
        content: "附带图片的测试",
        files: [
          {
            name: "test.png",
            path: "/path/to/test.png",
            type: "image",
          },
        ],
      } as any,
    ])

    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "附带图片的测试" },
        {
          type: "text",
          text: "Attached image: /path/to/test.png (use the view_image tool to inspect it)",
        },
      ],
    })
  })

  it("多张图片附件按顺序各注入一条路径提示", () => {
    const result = toModelMessages([
      {
        role: "user",
        content: "对比一下",
        files: [
          { name: "a.png", path: "/repo/a.png", type: "image" },
          { name: "b.jpg", path: "/repo/b.jpg", type: "image" },
        ],
      } as any,
    ])

    expect(result[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: "对比一下" },
        {
          type: "text",
          text: "Attached image: /repo/a.png (use the view_image tool to inspect it)",
        },
        {
          type: "text",
          text: "Attached image: /repo/b.jpg (use the view_image tool to inspect it)",
        },
      ],
    })
  })

  it("user 消息携带文本附件时仍内联为 document 块", () => {
    const dir = mkdtempSync(join(tmpdir(), "lx-to-model-messages-"))
    const filePath = join(dir, "note.txt")
    writeFileSync(filePath, "hello attachment")
    try {
      const result = toModelMessages([
        {
          role: "user",
          content: "看下附件",
          files: [{ name: "note.txt", path: filePath, type: "text" }],
        } as any,
      ])

      expect(result[0]).toEqual({
        role: "user",
        content: [
          { type: "text", text: "看下附件" },
          { type: "text", text: '\n\n<document path="note.txt">\nhello attachment\n</document>' },
        ],
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
