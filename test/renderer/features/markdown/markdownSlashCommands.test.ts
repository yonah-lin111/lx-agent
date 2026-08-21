import { describe, expect, it } from "vitest"
import {
  getMarkdownArmedSlashCommand,
  getMarkdownSelectCommandValue,
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
    expect(getMarkdownSlashCommandLine("   /summaryTitle", 10, 20)).toMatchObject({
      value: "/summaryTitle",
    })
    expect(getMarkdownSlashCommandLine("plain text", 0, 10)).toBeNull()
  })

  it("模板块外匹配模板命令与全局工作区命令", () => {
    expect(getMarkdownSlashCommands("/add", false).map((c) => c.id)).toEqual(["addTemplate"])
    expect(getMarkdownSlashCommands("/sum", false)).toEqual([])
    expect(getMarkdownSlashCommands("/git", false).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/", false).map((c) => c.id)).toEqual([
      "addTemplate",
      "bugTemplate",
      "refactorTemplate",
      "commonTemplate",
      "styleTemplate",
      "gitWorktree",
    ])
  })

  it("支持大小写不敏感的子序列模糊匹配", () => {
    expect(getMarkdownSlashCommands("/GWT", false).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/adT", false).map((c) => c.id)).toEqual(["addTemplate"])
    expect(getMarkdownSlashCommands("/zzz", false)).toEqual([])
  })

  it("模板块内匹配 AI 总结命令与全局工作区命令", () => {
    expect(getMarkdownSlashCommands("/sum", true).map((c) => c.id)).toEqual(["summaryTitle"])
    expect(getMarkdownSlashCommands("/add", true)).toEqual([])
    expect(getMarkdownSlashCommands("/git", true).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/", true).map((c) => c.id)).toEqual([
      "summaryTitle",
      "gitWorktree",
    ])
  })

  it("virtual 项目（无 git 上下文）不列出工作区命令", () => {
    expect(getMarkdownSlashCommands("/git", false, false)).toEqual([])
    expect(getMarkdownSlashCommands("/", true, false).map((c) => c.id)).toEqual(["summaryTitle"])
  })
  it("支持多语言环境下的模板文案切换", () => {
    const zhCommands = getMarkdownSlashCommands("/style", false, true, [], "zh")
    expect(zhCommands[0]?.description).toBe("插入样式设计提示词模板")
    expect(zhCommands[0]?.content).toContain("# 样式设计")

    const enCommands = getMarkdownSlashCommands("/style", false, true, [], "en")
    expect(enCommands[0]?.description).toBe("Insert style design prompt template")
    expect(enCommands[0]?.content).toContain("# Design Style")
    expect(enCommands[0]?.content).toContain("- Reference: ")
  })
})

describe("Markdown 斜杠命令武装判定", () => {
  it("确认型命令：仅模板块内且行内容完全一致时武装", () => {
    expect(getMarkdownArmedSlashCommand("/summaryTitle", true)?.id).toBe("summaryTitle")
    expect(getMarkdownArmedSlashCommand("/summaryTitle ", true)?.id).toBe("summaryTitle")
    expect(getMarkdownArmedSlashCommand("/summaryTitle", false)).toBeNull()
    expect(getMarkdownArmedSlashCommand("/summaryTitle xxx", true)).toBeNull()
  })

  it("选择型命令：标签后带值时武装，且不受模板块内外限制", () => {
    expect(getMarkdownArmedSlashCommand("/gitWorktree feature-x", false)?.id).toBe("gitWorktree")
    expect(getMarkdownArmedSlashCommand("/gitWorktree feature-x ", true)?.id).toBe("gitWorktree")
    expect(getMarkdownArmedSlashCommand("/gitWorktree", false)).toBeNull()
    expect(getMarkdownArmedSlashCommand("/gitWorktree ", false)).toBeNull()
  })

  it("提取选择型命令携带的值", () => {
    expect(getMarkdownSelectCommandValue("/gitWorktree feature-x", false)).toBe("feature-x")
    expect(getMarkdownSelectCommandValue("/gitWorktree feature-x ", true)).toBe("feature-x")
    expect(getMarkdownSelectCommandValue("/gitWorktree", false)).toBeNull()
    expect(getMarkdownSelectCommandValue("/summaryTitle", true)).toBeNull()
  })

  it("自定义命令：支持传入并在指定范围生效", () => {
    const customCommands = [
      {
        id: "custom:my-global",
        label: "/my-global",
        description: "全局自定义模板",
        content: "hello world",
        cursorOffset: 11,
        scope: "both" as const,
        kind: "customTemplate" as const,
        source: "project" as const,
      },
      {
        id: "custom:block-only",
        label: "/block-only",
        description: "仅模板块自定义命令",
        content: "- item",
        cursorOffset: 6,
        scope: "template" as const,
        kind: "customTemplate" as const,
        source: "user" as const,
      },
    ]

    // 模板块外：仅 my-global 可见
    const normalMatches = getMarkdownSlashCommands("/", false, true, customCommands)
    expect(normalMatches.some((c) => c.id === "custom:my-global")).toBe(true)
    expect(normalMatches.some((c) => c.id === "custom:block-only")).toBe(false)

    // 模板块内：my-global 与 block-only 均可见
    const templateMatches = getMarkdownSlashCommands("/", true, true, customCommands)
    expect(templateMatches.some((c) => c.id === "custom:my-global")).toBe(true)
    expect(templateMatches.some((c) => c.id === "custom:block-only")).toBe(true)

    // 精确查询
    expect(getMarkdownSlashCommands("/my-", false, true, customCommands).map((c) => c.id)).toEqual([
      "custom:my-global",
    ])
    expect(getMarkdownSlashCommands("/block", true, true, customCommands).map((c) => c.id)).toEqual(
      ["custom:block-only"],
    )
  })
})
