import { describe, expect, it } from "vitest"
import {
  extractAgentMentions,
  getAgentMentionDeletionRange,
} from "@/features/markdown/extensions/markdownAgentMentions"

describe("extractAgentMentions 正则提取能力", () => {
  it("提取基础 token 并使用角色名作为捕获组", () => {
    const text = "@agent:explorer"
    const mentions = extractAgentMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      name: "explorer",
      fullMatch: "@agent:explorer",
      start: 0,
      end: text.length,
    })
  })

  it("正确提取多个 token 及其位置", () => {
    const text = "run @agent:review then @agent:worker"
    const mentions = extractAgentMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]).toMatchObject({
      name: "review",
      start: text.indexOf("@agent:review"),
      end: text.indexOf("@agent:review") + "@agent:review".length,
    })
    expect(mentions[1]).toMatchObject({
      name: "worker",
      start: text.indexOf("@agent:worker"),
      end: text.indexOf("@agent:worker") + "@agent:worker".length,
    })
  })

  it("遇到常见标点边界时停止匹配，标点不参与 token", () => {
    const text = "@agent:explorer，请继续。@agent:review."
    const mentions = extractAgentMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]?.fullMatch).toBe("@agent:explorer")
    expect(mentions[1]?.fullMatch).toBe("@agent:review")
  })

  it("允许角色名包含下划线与连字符", () => {
    const text = "@agent:code_review-2"
    const mentions = extractAgentMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]?.name).toBe("code_review-2")
  })

  it("忽略前缀为字母的邮箱形式，避免误匹配", () => {
    const mentions = extractAgentMentions("abc@agent:foo and [x]x@agent:bar")

    expect(mentions).toHaveLength(0)
  })

  it("忽略非 agent 前缀的 @ 内容", () => {
    const mentions = extractAgentMentions("@agency @agent @agent:Review @agent:")

    expect(mentions).toHaveLength(0)
  })
})

describe("getAgentMentionDeletionRange 快速删除范围计算", () => {
  it("光标紧贴 token 末尾时整块删除", () => {
    const text = "@agent:explorer"
    const range = getAgentMentionDeletionRange(text, text.length)

    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标紧贴 token 末尾且后跟单个空格时连同空格删除", () => {
    const text = "@agent:explorer "
    const range = getAgentMentionDeletionRange(text, text.length - 1)

    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标位于末尾单个空格之后时整块删除", () => {
    const text = "@agent:explorer "
    const range = getAgentMentionDeletionRange(text, text.length)

    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标处于 token 内部时返回 null，降级为逐字删除", () => {
    const text = "@agent:explorer"

    expect(getAgentMentionDeletionRange(text, 5)).toBeNull()
  })

  it("文本中不存在提及时返回 null", () => {
    expect(getAgentMentionDeletionRange("hello world", 11)).toBeNull()
  })
})
