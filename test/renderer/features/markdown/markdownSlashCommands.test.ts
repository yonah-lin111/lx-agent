import { describe, expect, it } from "vitest"
import {
  getMarkdownArmedSlashCommand,
  getMarkdownSelectCommandValue,
  getMarkdownSendPromptFlagOptions,
  getMarkdownSendPromptOptions,
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
  parseMarkdownSendPromptCommandLine,
  stripMarkdownSlashCommands,
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

  it("模板块内匹配模板内可用命令与全局工作区命令", () => {
    expect(getMarkdownSlashCommands("/sum", true).map((c) => c.id)).toEqual([
      "suppleTemplate",
      "summaryTitle",
    ])
    expect(getMarkdownSlashCommands("/send", true).map((c) => c.id)).toEqual(["sendPrompt"])
    expect(getMarkdownSlashCommands("/send", false)).toEqual([])
    expect(getMarkdownSlashCommands("/add", true)).toEqual([])
    expect(getMarkdownSlashCommands("/git", true).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/", true).map((c) => c.id)).toEqual([
      "suppleTemplate",
      "sendPrompt",
      "summaryTitle",
      "gitWorktree",
    ])
  })

  it("virtual 项目（无 git 上下文）不列出工作区命令", () => {
    expect(getMarkdownSlashCommands("/git", false, false)).toEqual([])
    expect(getMarkdownSlashCommands("/", true, false).map((c) => c.id)).toEqual([
      "suppleTemplate",
      "sendPrompt",
      "summaryTitle",
    ])
  })
  it("支持多语言环境下的模板文案切换", () => {
    const zhCommands = getMarkdownSlashCommands("/style", false, true, [], "zh")
    expect(zhCommands[0]?.description).toBe("插入样式设计提示词模板")
    expect(zhCommands[0]?.content).toContain("# 样式设计")

    const enCommands = getMarkdownSlashCommands("/style", false, true, [], "en")
    expect(enCommands[0]?.description).toBe("Insert style design prompt template")
    expect(enCommands[0]?.content).toContain("# Design Style")
    expect(enCommands[0]?.content).toContain("- Reference: ")

    const zhSend = getMarkdownSlashCommands("/send", true, true, [], "zh")
    expect(zhSend[0]?.description).toBe("发送当前模板块 Prompt 到 Agent 或终端 CLI")

    const enSend = getMarkdownSlashCommands("/send", true, true, [], "en")
    expect(enSend[0]?.description).toBe("Send current template block prompt to Agent or Terminal CLI")
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

    expect(getMarkdownArmedSlashCommand("/sendPrompt agent", true)?.id).toBe("sendPrompt")
    expect(getMarkdownArmedSlashCommand("/sendPrompt claude", true)?.id).toBe("sendPrompt")
    expect(getMarkdownArmedSlashCommand("/sendPrompt", true)).toBeNull()
    expect(getMarkdownArmedSlashCommand("/sendPrompt ", true)).toBeNull()
  })

  it("提取选择型命令携带的值", () => {
    expect(getMarkdownSelectCommandValue("/gitWorktree feature-x", false)).toBe("feature-x")
    expect(getMarkdownSelectCommandValue("/gitWorktree feature-x ", true)).toBe("feature-x")
    expect(getMarkdownSelectCommandValue("/sendPrompt agent", true)).toBe("agent")
    expect(getMarkdownSelectCommandValue("/sendPrompt claude", true)).toBe("claude")
    expect(getMarkdownSelectCommandValue("/gitWorktree", false)).toBeNull()
    expect(getMarkdownSelectCommandValue("/sendPrompt", true)).toBeNull()
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
    expect(getMarkdownSlashCommands("/block", true, true, customCommands).map((c) => c.id)).toEqual(
      ["custom:block-only"],
    )
  })

  it("stripMarkdownSlashCommands: 移除内容中的斜杠命令文本并保留空行换行", () => {
    const text = [
      "# Fix Bug",
      "/sendPrompt agent",
      "- Location: @src/components/MyComp.tsx",
      "/gitWorktree dev",
      "- Description: 修复问题",
      "/summaryTitle",
    ].join("\n")

    expect(stripMarkdownSlashCommands(text)).toBe(
      [
        "# Fix Bug",
        "",
        "- Location: @src/components/MyComp.tsx",
        "",
        "- Description: 修复问题",
        "",
      ].join("\n"),
    )
  })

  it("getMarkdownSendPromptOptions 支持根据打开的终端动态列出运行中实例（含同名编号区分）", () => {
    const tabs = [
      { title: "opencode-dev" },
      { title: "opencode-fix" },
      { title: "cc-switch-main" },
    ]
    const options = getMarkdownSendPromptOptions("zh", tabs)
    expect(options.some((o) => o.id === "opencode:opencode-dev" && o.isRunning)).toBe(true)
    expect(options.some((o) => o.id === "opencode:opencode-fix" && o.isRunning)).toBe(true)
    expect(options.some((o) => o.id === "lx" && o.targetType === "agent")).toBe(true)
    expect(options.some((o) => o.id === "opencode" && !o.isRunning)).toBe(true)

    // 打开两个完全同名的默认 opencode 终端
    const duplicateTabs = [
      { title: "opencode" },
      { title: "opencode" },
    ]
    const dupOptions = getMarkdownSendPromptOptions("zh", duplicateTabs)
    expect(dupOptions.filter((o) => o.isRunning).length).toBe(2)
    expect(dupOptions.some((o) => o.id === "opencode:#1" && o.label === "OpenCode:#1")).toBe(true)
    expect(dupOptions.some((o) => o.id === "opencode:#2" && o.label === "OpenCode:#2")).toBe(true)

    // 单个 Tab 内存在 2 个分屏 Pane（无自定义标题）
    const splitTab = [
      {
        title: "OpenCode",
        panes: {
          "pane-1": { id: "pane-1", title: "OpenCode" },
          "pane-2": { id: "pane-2", title: "OpenCode" },
        },
      },
    ]
    const splitOptions = getMarkdownSendPromptOptions("zh", splitTab)
    expect(splitOptions.filter((o) => o.isRunning).length).toBe(2)
    expect(splitOptions.some((o) => o.id === "opencode:#1" && o.label === "OpenCode:#1")).toBe(true)
    expect(splitOptions.some((o) => o.id === "opencode:#2" && o.label === "OpenCode:#2")).toBe(true)

    // 3 个 OpenCode：1 个有自定义标题，2 个无标题
    const mixedTabs = [
      {
        title: "修复列表触底悬停时滚动条抖动",
        panes: { "pane-1": { id: "pane-1", title: "opencode" } },
      },
      {
        title: "OpenCode",
        panes: { "pane-2": { id: "pane-2", title: "OpenCode" } },
      },
      {
        title: "OpenCode",
        panes: { "pane-3": { id: "pane-3", title: "OpenCode" } },
      },
    ]
    const mixedOptions = getMarkdownSendPromptOptions("zh", mixedTabs)
    expect(mixedOptions.filter((o) => o.isRunning).length).toBe(3)
    expect(
      mixedOptions.some((o) => o.label === "OpenCode:修复列表触底悬停时滚动条抖动"),
    ).toBe(true)
    expect(mixedOptions.some((o) => o.label === "OpenCode:#1")).toBe(true)
    expect(mixedOptions.some((o) => o.label === "OpenCode:#2")).toBe(true)
  })

  it("getMarkdownSendPromptFlagOptions & parseMarkdownSendPromptCommandLine", () => {
    const flagsZh = getMarkdownSendPromptFlagOptions("zh")
    expect(flagsZh.some((f) => f.id === "-new")).toBe(true)

    const flagsEn = getMarkdownSendPromptFlagOptions("en")
    expect(flagsEn.some((f) => f.id === "-new")).toBe(true)

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt opencode")).toEqual({
      target: "opencode",
      instance: null,
      flag: null,
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt opencode:opencode-dev")).toEqual({
      target: "opencode",
      instance: "opencode-dev",
      flag: null,
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt opencode:opencode-dev -new ")).toEqual({
      target: "opencode",
      instance: "opencode-dev",
      flag: "-new",
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt claude -new")).toEqual({
      target: "claude",
      instance: null,
      flag: "-new",
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt LX Agent")).toEqual({
      target: "agent",
      instance: null,
      flag: null,
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt gemini")).toEqual({
      target: "gemini",
      instance: null,
      flag: null,
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt codex:codex-task -new")).toEqual({
      target: "codex",
      instance: "codex-task",
      flag: "-new",
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt agy")).toEqual({
      target: "agy",
      instance: null,
      flag: null,
    })

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt antigravity:task-1")).toEqual({
      target: "agy",
      instance: "task-1",
      flag: null,
    })
  })
})

