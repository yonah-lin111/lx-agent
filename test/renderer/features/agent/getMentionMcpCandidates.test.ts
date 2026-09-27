import { describe, expect, it } from "vitest"
import type { McpMentionCandidate } from "@/features/agent/components/AgentInput/AgentInputCommandPanels"
import { getMentionMcpCandidates } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"

const candidates: McpMentionCandidate[] = [
  { name: "codegraph", toolsCount: 3 },
  { name: "context7", toolsCount: 2 },
]

describe("getMentionMcpCandidates", () => {
  it("空查询与 tag 模糊命中（如 @mc / @MCP）整类返回", () => {
    expect(getMentionMcpCandidates(candidates, "")).toHaveLength(2)
    expect(getMentionMcpCandidates(candidates, "mc")).toHaveLength(2)
    expect(getMentionMcpCandidates(candidates, "MCP")).toHaveLength(2)
  })

  it("mcp / mcp: / mcp/ 前缀裁剪后按 server 名过滤", () => {
    expect(getMentionMcpCandidates(candidates, "mcp").map((item) => item.name)).toEqual([
      "codegraph",
      "context7",
    ])
    expect(getMentionMcpCandidates(candidates, "mcp:").map((item) => item.name)).toEqual([
      "codegraph",
      "context7",
    ])
    expect(getMentionMcpCandidates(candidates, "mcp:cont").map((item) => item.name)).toEqual([
      "context7",
    ])
    expect(getMentionMcpCandidates(candidates, "mcp/code").map((item) => item.name)).toEqual([
      "codegraph",
    ])
  })

  it("非 tag 的首个显式前缀查询不参与候补", () => {
    expect(getMentionMcpCandidates(candidates, "cont")).toEqual([])
    expect(getMentionMcpCandidates(candidates, "xyz")).toEqual([])
  })

  it("前缀无匹配时返回空数组", () => {
    expect(getMentionMcpCandidates(candidates, "mcp:missing")).toEqual([])
  })
})
