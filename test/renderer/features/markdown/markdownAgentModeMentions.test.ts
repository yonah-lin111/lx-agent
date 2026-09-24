import { describe, expect, it } from "vitest"
import {
  extractAgentModeMentions,
  getAgentModeMentionDeletionRange,
} from "@/features/markdown/extensions/markdownAgentModeMentions"

describe("extractAgentModeMentions 正则提取能力", () => {
  it("提取基础 token 并使用模式名作为捕获组", () => {
    const text = "@agentMode:plan"
    const mentions = extractAgentModeMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      mode: "plan",
      fullMatch: "@agentMode:plan",
      start: 0,
      end: text.length,
    })
  })

  it("正确提取多个模式 token 及其位置", () => {
    const text = "first @agentMode:plan then @agentMode:review"
    const mentions = extractAgentModeMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]).toMatchObject({
      mode: "plan",
      start: text.indexOf("@agentMode:plan"),
      end: text.indexOf("@agentMode:plan") + "@agentMode:plan".length,
    })
    expect(mentions[1]).toMatchObject({
      mode: "review",
      start: text.indexOf("@agentMode:review"),
      end: text.indexOf("@agentMode:review") + "@agentMode:review".length,
    })
  })

  it("遇到标点边界时停止匹配，标点不参与 token", () => {
    const text = "@agentMode:plan，请先规划。@agentMode:review!"
    const mentions = extractAgentModeMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]?.fullMatch).toBe("@agentMode:plan")
    expect(mentions[1]?.fullMatch).toBe("@agentMode:review")
  })

  it("忽略前缀为英文字符的邮箱或拼接形式", () => {
    const mentions = extractAgentModeMentions("abc@agentMode:plan and test@agentMode:build")
    expect(mentions).toHaveLength(0)
  })

  it("忽略不合法格式", () => {
    const mentions = extractAgentModeMentions("@agentMode @agentMode: @agentmode:plan")
    expect(mentions).toHaveLength(0)
  })
})

describe("getAgentModeMentionDeletionRange 快速删除范围计算", () => {
  it("光标紧贴 token 末尾时整块删除", () => {
    const text = "@agentMode:plan"
    const range = getAgentModeMentionDeletionRange(text, text.length)
    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("紧邻单个空格但光标在空格前时，整块连同尾随空格删除", () => {
    const text = "@agentMode:plan "
    const range = getAgentModeMentionDeletionRange(text, text.length - 1)
    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标位于尾随单个空格之后时，一并整块删除", () => {
    const text = "@agentMode:review "
    const range = getAgentModeMentionDeletionRange(text, text.length)
    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标在 token 内部时返回 null，降级为单字符编辑", () => {
    const text = "@agentMode:design"
    expect(getAgentModeMentionDeletionRange(text, 5)).toBeNull()
  })

  it("无匹配 token 时返回 null", () => {
    expect(getAgentModeMentionDeletionRange("hello world", 11)).toBeNull()
  })
})
