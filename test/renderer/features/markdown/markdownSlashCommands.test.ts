import { describe, expect, it } from "vitest"
import {
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
} from "@/features/markdown/commands/markdownSlashCommands"

describe("Markdown 斜杠命令", () => {
  it("解析光标所在行的斜杠命令范围", () => {
    expect(getMarkdownSlashCommandLine("/addTemplate", 10, 22)).toEqual({
      from: 10,
      to: 22,
      value: "/addTemplate",
    })
    expect(getMarkdownSlashCommandLine("   /summary", 10, 20)).toMatchObject({
      value: "/summary",
    })
    expect(getMarkdownSlashCommandLine("plain text", 0, 10)).toBeNull()
  })

  it("模板块外仅匹配模板命令", () => {
    expect(getMarkdownSlashCommands("/add", false).map((c) => c.id)).toEqual(["addTemplate"])
    expect(getMarkdownSlashCommands("/sum", false)).toEqual([])
    expect(getMarkdownSlashCommands("/", false).map((c) => c.id)).toEqual([
      "addTemplate",
      "bugTemplate",
      "refactorTemplate",
      "commonTemplate",
    ])
  })

  it("模板块内仅匹配 AI 总结命令", () => {
    expect(getMarkdownSlashCommands("/sum", true).map((c) => c.id)).toEqual(["summary"])
    expect(getMarkdownSlashCommands("/add", true)).toEqual([])
    expect(getMarkdownSlashCommands("/", true).map((c) => c.id)).toEqual(["summary"])
  })
})
