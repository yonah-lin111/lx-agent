import { describe, expect, it } from "vitest"
import {
  extractMcpMentions,
  getMcpMentionDeletionRange,
} from "@/features/markdown/extensions/markdownMcpMentions"

describe("extractMcpMentions 正则提取能力", () => {
  it("提取基础 token 并使用 server 名作为捕获组", () => {
    const text = "@mcp:codegraph"
    const mentions = extractMcpMentions(text)

    expect(mentions).toHaveLength(1)
    expect(mentions[0]).toMatchObject({
      name: "codegraph",
      fullMatch: "@mcp:codegraph",
      start: 0,
      end: text.length,
    })
  })

  it("正确提取多个 token 及其位置", () => {
    const text = "use @mcp:codegraph then @mcp:context7"
    const mentions = extractMcpMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]).toMatchObject({
      name: "codegraph",
      start: text.indexOf("@mcp:codegraph"),
      end: text.indexOf("@mcp:codegraph") + "@mcp:codegraph".length,
    })
    expect(mentions[1]).toMatchObject({
      name: "context7",
      start: text.indexOf("@mcp:context7"),
      end: text.indexOf("@mcp:context7") + "@mcp:context7".length,
    })
  })

  it("遇到常见标点边界时停止匹配，标点不参与 token", () => {
    const text = "@mcp:codegraph，请继续。@mcp:context7."
    const mentions = extractMcpMentions(text)

    expect(mentions).toHaveLength(2)
    expect(mentions[0]?.fullMatch).toBe("@mcp:codegraph")
    expect(mentions[1]?.fullMatch).toBe("@mcp:context7")
  })

  it("允许 server 名包含连字符、下划线与大写字母", () => {
    const mentions = extractMcpMentions("@mcp:codebase-memory-mcp @mcp:my_server @mcp:Context7")

    expect(mentions.map((mention) => mention.name)).toEqual([
      "codebase-memory-mcp",
      "my_server",
      "Context7",
    ])
  })

  it("忽略前缀为字母的邮箱形式，避免误匹配", () => {
    expect(extractMcpMentions("abc@mcp:foo and [x]x@mcp:bar")).toHaveLength(0)
  })

  it("忽略非 mcp 前缀的 @ 内容", () => {
    expect(extractMcpMentions("@mcps @mcp @mcp:")).toHaveLength(0)
  })
})

describe("getMcpMentionDeletionRange 快速删除范围计算", () => {
  it("光标紧贴 token 末尾时整块删除", () => {
    const text = "@mcp:codegraph"
    const range = getMcpMentionDeletionRange(text, text.length)

    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标紧贴 token 末尾且后跟单个空格时连同空格删除", () => {
    const text = "@mcp:codegraph "
    const range = getMcpMentionDeletionRange(text, text.length - 1)

    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标位于末尾单个空格之后时整块删除", () => {
    const text = "@mcp:codegraph "
    const range = getMcpMentionDeletionRange(text, text.length)

    expect(range).toEqual({ from: 0, to: text.length })
  })

  it("光标处于 token 内部时返回 null，降级为逐字删除", () => {
    expect(getMcpMentionDeletionRange("@mcp:codegraph", 5)).toBeNull()
  })

  it("文本中不存在提及时返回 null", () => {
    expect(getMcpMentionDeletionRange("hello world", 11)).toBeNull()
  })
})
