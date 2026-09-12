import type { ModelProvider } from "@shared/settings"
import { describe, expect, it, vi } from "vitest"

// mock electron：固定应用版本，验证 UA 生成。
vi.mock("electron", () => ({
  app: { getVersion: () => "1.2.3" },
}))

import {
  buildOpencodeGoRequestHeaders,
  isOpencodeGoEndpoint,
  OPENCODE_GO_AUXILIARY_SESSION_IDS,
} from "@/agent/stream/opencodeGoHeaders"

const provider = (baseURL: string): ModelProvider => ({
  id: "oc-go",
  type: "openai-compatible",
  name: "OpenCode Go",
  options: { apiKey: "sk-test", baseURL },
  models: {},
})

describe("isOpencodeGoEndpoint", () => {
  it("匹配 opencode.ai 主机下的 /zen/go 路径段", () => {
    expect(isOpencodeGoEndpoint("https://opencode.ai/zen/go")).toBe(true)
    expect(isOpencodeGoEndpoint("https://opencode.ai/zen/go/v1")).toBe(true)
    expect(isOpencodeGoEndpoint("https://opencode.ai/zen/go/v1/chat/completions")).toBe(true)
    expect(isOpencodeGoEndpoint("https://opencode.ai/zen/go/v1/messages")).toBe(true)
  })

  it("拒绝子域、其他主机与相似路径", () => {
    expect(isOpencodeGoEndpoint("https://sub.opencode.ai/zen/go/v1")).toBe(false)
    expect(isOpencodeGoEndpoint("https://opencode.ai/zen/v1")).toBe(false)
    expect(isOpencodeGoEndpoint("https://opencode.ai/zen/gofoo/v1")).toBe(false)
    expect(isOpencodeGoEndpoint("https://proxy.example.com/zen/go/v1")).toBe(false)
    expect(isOpencodeGoEndpoint("https://api.minimax.chat/v1")).toBe(false)
  })

  it("空串与非法 URL 返回 false", () => {
    expect(isOpencodeGoEndpoint("")).toBe(false)
    expect(isOpencodeGoEndpoint("not a url")).toBe(false)
  })
})

describe("buildOpencodeGoRequestHeaders", () => {
  it("opencode Go Provider 注入真实会话 ID 与客户端 UA", () => {
    expect(
      buildOpencodeGoRequestHeaders(provider("https://opencode.ai/zen/go/v1"), "ses_lx_1"),
    ).toEqual({
      "x-opencode-session": "ses_lx_1",
      "user-agent": "lx-agent/1.2.3",
    })
  })

  it("会话 ID 为空时回退到稳定的兜底合成 ID", () => {
    for (const sessionId of [null, undefined, "", "   "]) {
      expect(
        buildOpencodeGoRequestHeaders(provider("https://opencode.ai/zen/go/v1"), sessionId),
      ).toEqual({
        "x-opencode-session": OPENCODE_GO_AUXILIARY_SESSION_IDS.auxiliary,
        "user-agent": "lx-agent/1.2.3",
      })
    }
  })

  it("非 opencode Go Provider 与缺失 Provider 均返回 undefined", () => {
    expect(
      buildOpencodeGoRequestHeaders(provider("https://api.minimax.chat/v1"), "ses_lx_1"),
    ).toBeUndefined()
    expect(
      buildOpencodeGoRequestHeaders(provider("https://proxy.example.com/zen/go/v1"), "ses_lx_1"),
    ).toBeUndefined()
    expect(buildOpencodeGoRequestHeaders(undefined, "ses_lx_1")).toBeUndefined()
  })
})
