import { describe, expect, it } from "vitest"
import {
  extractClawMentions,
  getClawMentionDeletionRange,
  resolveClawDispatchTargets,
  stripClawMention,
  stripClawMentions,
} from "@/features/openclaw"

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

describe("stripClawMention / stripClawMentions", () => {
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

  it("可一次剥离多条提及", () => {
    expect(stripClawMentions("@claw:local/lily @claw:cloud/amy 一起排查")).toBe("一起排查")
  })
})

describe("getClawMentionDeletionRange", () => {
  it("光标紧贴提及末尾时整块删除并吞掉尾随空格", () => {
    const text = "@claw:local/lily (Lily) next"
    const end = "@claw:local/lily (Lily)".length

    expect(getClawMentionDeletionRange(text, end)).toEqual({ from: 0, to: end + 1 })
  })

  it("光标处于提及内部时降级为 null", () => {
    expect(getClawMentionDeletionRange("@claw:local/lily abc", 5)).toBeNull()
  })

  it("无提及时返回 null", () => {
    expect(getClawMentionDeletionRange("plain text", 5)).toBeNull()
  })
})

describe("resolveClawDispatchTargets", () => {
  const office = ["lily", "amy", "bob"]

  it("有 @claw 提及时以提及目标为准（仅限当前办公区）", () => {
    const result = resolveClawDispatchTargets("@claw:local/lily @claw:other/zoe 跑测试", office, [
      "bob",
    ])

    expect(result.agentIds).toEqual(["lily"])
    expect(result.body).toBe("跑测试")
  })

  it("无提及时回退到选中集合", () => {
    const result = resolveClawDispatchTargets("跑测试", office, ["amy", "bob"])

    expect(result.agentIds).toEqual(["amy", "bob"])
    expect(result.body).toBe("跑测试")
  })

  it("目标去重且保持顺序", () => {
    const result = resolveClawDispatchTargets(
      "@claw:local/amy @claw:local/lily @claw:local/amy hi",
      office,
      [],
    )

    expect(result.agentIds).toEqual(["amy", "lily"])
  })

  it("选中集合中不属于当前办公区的 id 被过滤", () => {
    const result = resolveClawDispatchTargets("hi", office, ["zoe", "lily"])

    expect(result.agentIds).toEqual(["lily"])
  })
})
