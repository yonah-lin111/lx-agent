import { describe, expect, it } from "vitest"
import {
  extractClawMentions,
  stripClawMention,
} from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"

describe("extractClawMentions", () => {
  it("解析 instance/agent 并去掉显示名后缀", () => {
    const mentions = extractClawMentions("@claw:local/lily (Lily) 帮我跑一下测试")

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      instanceId: "local",
      agentId: "lily",
      fullMatch: "@claw:local/lily (Lily)",
    })
  })

  it("无显示名后缀也能解析", () => {
    const mentions = extractClawMentions("@claw:cloud/amy summarize the logs")

    expect(mentions[0]?.instanceId).toBe("cloud")
    expect(mentions[0]?.agentId).toBe("amy")
  })

  it("不接受前缀紧贴单词字符的伪提及", () => {
    expect(extractClawMentions("foo@claw:local/lily")).toHaveLength(0)
  })

  it("缺少 agent 段时不匹配", () => {
    expect(extractClawMentions("@claw:local")).toHaveLength(0)
    expect(extractClawMentions("@claw:local/")).toHaveLength(0)
  })

  it("可解析多条提及", () => {
    const mentions = extractClawMentions("@claw:local/lily a\n@claw:cloud/amy b")

    expect(mentions.map((mention) => `${mention.instanceId}/${mention.agentId}`)).toEqual([
      "local/lily",
      "cloud/amy",
    ])
  })
})

describe("stripClawMention", () => {
  it("移除提及后保留任务正文", () => {
    const text = "@claw:local/lily (Lily) 帮我跑一下测试"
    const [mention] = extractClawMentions(text)

    expect(stripClawMention(text, mention)).toBe("帮我跑一下测试")
  })

  it("提及位于末尾时返回空字符串", () => {
    const text = "@claw:local/lily (Lily)"
    const [mention] = extractClawMentions(text)

    expect(stripClawMention(text, mention)).toBe("")
  })

  it("保留提及之后的其余文本", () => {
    const text = "@claw:local/lily 先做 A 再做 B"
    const [mention] = extractClawMentions(text)

    expect(stripClawMention(text, mention)).toBe("先做 A 再做 B")
  })
})
