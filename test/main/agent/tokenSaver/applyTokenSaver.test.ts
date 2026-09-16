// Token Saver 出站转换测试：非破坏性、错误跳过、提示词注入与 fail-open。

import { DEFAULT_TOKEN_SAVER_SETTINGS, type TokenSaverSettings } from "@shared/settings"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { LlmMessage } from "@/agent/core/types"
import { applyTokenSaver } from "@/agent/tokenSaver/applyTokenSaver"
import { CAVEMAN_PROMPTS, PONYTAIL_PROMPTS } from "@/agent/tokenSaver/prompts"
import { RTK_FILTER_NAMES } from "@/agent/tokenSaver/rtk/constants"
import { RTK_FILTERS } from "@/agent/tokenSaver/rtk/registry"

const withSettings = (patch: Partial<TokenSaverSettings>): TokenSaverSettings => ({
  ...DEFAULT_TOKEN_SAVER_SETTINGS,
  ...patch,
})

const makeLongDiff = (): string => {
  const lines = ["diff --git a/foo.js b/foo.js", "@@ -1,3 +1,200 @@"]
  for (let i = 0; i < 200; i++) lines.push(`+added line ${i} ${"x".repeat(20)}`)
  return lines.join("\n")
}

const makeToolResult = (text: string, isError = false): LlmMessage => ({
  role: "toolResult",
  toolCallId: "call_1",
  toolName: "bash",
  content: [{ type: "text", text }],
  isError,
})

const toolResultText = (message: LlmMessage): string => {
  if (message.role !== "toolResult") throw new Error("not a toolResult message")
  const block = message.content[0]
  if (!block || block.type !== "text") throw new Error("not a text block")
  return block.text
}

describe("applyTokenSaver 工具输出压缩", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("全部关闭时返回入参引用", () => {
    const request = { systemPrompt: "sys", messages: [makeToolResult(makeLongDiff())] }
    const out = applyTokenSaver(request, withSettings({ rtkEnabled: false }))
    expect(out).toBe(request)
  })

  it("开启后压缩出站副本且保持原始消息不变", () => {
    const raw = makeLongDiff()
    const message = makeToolResult(raw)
    const request = { systemPrompt: "sys", messages: [message] }

    const out = applyTokenSaver(request, withSettings({ rtkEnabled: true }))

    expect(out).not.toBe(request)
    expect(toolResultText(out.messages[0] ?? message).length).toBeLessThan(raw.length)
    // 原始消息对象保持原始输出（非破坏性）。
    expect(toolResultText(message)).toBe(raw)
  })

  it("无可压缩内容时保持消息数组引用", () => {
    const request = { systemPrompt: "sys", messages: [makeToolResult("short output")] }
    const out = applyTokenSaver(request, withSettings({ rtkEnabled: true }))
    expect(out.messages).toBe(request.messages)
  })

  it("跳过 isError 工具结果", () => {
    const raw = makeLongDiff()
    const request = { systemPrompt: "sys", messages: [makeToolResult(raw, true)] }
    const out = applyTokenSaver(request, withSettings({ rtkEnabled: true }))
    expect(out.messages).toBe(request.messages)
    expect(toolResultText(out.messages[0] ?? makeToolResult(""))).toBe(raw)
  })

  it("图片块与非工具消息不受影响", () => {
    const userMessage: LlmMessage = { role: "user", content: "hi" }
    const imageMessage: LlmMessage = {
      role: "toolResult",
      toolCallId: "call_2",
      toolName: "view_image",
      content: [{ type: "image", data: "AAAA", mimeType: "image/png" }],
      isError: false,
    }
    const request = { systemPrompt: "sys", messages: [userMessage, imageMessage] }
    const out = applyTokenSaver(request, withSettings({ rtkEnabled: true }))
    expect(out.messages).toBe(request.messages)
  })

  it("过滤器异常时原样放行（fail-open）", () => {
    const raw = makeLongDiff()
    const request = { systemPrompt: "sys", messages: [makeToolResult(raw)] }
    const original = RTK_FILTERS[RTK_FILTER_NAMES.GIT_DIFF]
    RTK_FILTERS[RTK_FILTER_NAMES.GIT_DIFF] = () => {
      throw new Error("boom")
    }
    try {
      const out = applyTokenSaver(request, withSettings({ rtkEnabled: true }))
      expect(out.messages).toBe(request.messages)
    } finally {
      RTK_FILTERS[RTK_FILTER_NAMES.GIT_DIFF] = original
    }
  })
})

describe("applyTokenSaver 风格提示词", () => {
  it("Caveman 开启时按档位追加到系统提示词末尾", () => {
    const request = { systemPrompt: "base prompt", messages: [] }
    const out = applyTokenSaver(
      request,
      withSettings({ rtkEnabled: false, cavemanEnabled: true, cavemanLevel: "ultra" }),
    )
    expect(out.systemPrompt).toBe(`base prompt\n\n${CAVEMAN_PROMPTS.ultra}`)
  })

  it("系统提示词为空时只返回注入内容", () => {
    const request = { systemPrompt: "", messages: [] }
    const out = applyTokenSaver(
      request,
      withSettings({ rtkEnabled: false, cavemanEnabled: true, cavemanLevel: "lite" }),
    )
    expect(out.systemPrompt).toBe(CAVEMAN_PROMPTS.lite)
  })

  it("Ponytail 按档位注入", () => {
    const request = { systemPrompt: "base", messages: [] }
    const out = applyTokenSaver(
      request,
      withSettings({ rtkEnabled: false, ponytailEnabled: true, ponytailLevel: "ultra" }),
    )
    expect(out.systemPrompt).toBe(`base\n\n${PONYTAIL_PROMPTS.ultra}`)
  })

  it("两者同时开启时 Caveman 在前 Ponytail 在后", () => {
    const request = { systemPrompt: "base", messages: [] }
    const out = applyTokenSaver(
      request,
      withSettings({
        rtkEnabled: false,
        cavemanEnabled: true,
        cavemanLevel: "full",
        ponytailEnabled: true,
        ponytailLevel: "full",
      }),
    )
    expect(out.systemPrompt).toBe(`base\n\n${CAVEMAN_PROMPTS.full}\n\n${PONYTAIL_PROMPTS.full}`)
  })

  it("风格提示词关闭时不修改系统提示词引用", () => {
    const request = { systemPrompt: "base", messages: [] }
    const out = applyTokenSaver(request, withSettings({ rtkEnabled: false }))
    expect(out).toBe(request)
  })
})
