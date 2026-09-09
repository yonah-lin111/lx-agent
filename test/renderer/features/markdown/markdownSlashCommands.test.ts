import { describe, expect, it } from "vitest"
import {
  getMarkdownArmedSlashCommand,
  getMarkdownSelectCommandValue,
  getMarkdownSendPromptFlagOptions,
  getMarkdownSendPromptOptions,
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
  getTemplatePlaceholderSelectionRange,
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
    expect(getMarkdownSlashCommands("/var", false).map((c) => c.id)).toEqual(["varTemplate"])
    expect(getMarkdownSlashCommands("/add", false).map((c) => c.id)).toEqual(["addTemplate"])
    expect(getMarkdownSlashCommands("/sum", false)).toEqual([])
    expect(getMarkdownSlashCommands("/git", false).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/", false).map((c) => c.id)).toEqual([
      "varTemplate",
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
    expect(getMarkdownSlashCommands("/log", true).map((c) => c.id)).toEqual(["logTemplate"])
    expect(getMarkdownSlashCommands("/log", false)).toEqual([])
    expect(getMarkdownSlashCommands("/add", true)).toEqual([])
    expect(getMarkdownSlashCommands("/git", true).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/apply", true).map((c) => c.id)).toEqual(["applyPreset"])
    expect(getMarkdownSlashCommands("/", true).map((c) => c.id)).toEqual([
      "suppleTemplate",
      "logTemplate",
      "applyPreset",
      "sendPrompt",
      "summaryTitle",
      "gitWorktree",
    ])
  })

  it("virtual 项目（无 git 上下文）不列出工作区命令", () => {
    expect(getMarkdownSlashCommands("/git", false, false)).toEqual([])
    expect(getMarkdownSlashCommands("/", true, false).map((c) => c.id)).toEqual([
      "suppleTemplate",
      "logTemplate",
      "applyPreset",
      "sendPrompt",
      "summaryTitle",
    ])
  })

  it("模板命令统一使用英文正文与说明，非模板命令支持多语言环境切换", () => {
    const zhCommands = getMarkdownSlashCommands("/style", false, true, [], "zh")
    expect(zhCommands[0]?.description).toBe("Insert design style template block")
    expect(zhCommands[0]?.content).toContain("# Design Style")

    const enCommands = getMarkdownSlashCommands("/style", false, true, [], "en")
    expect(enCommands[0]?.description).toBe("Insert design style template block")
    expect(enCommands[0]?.content).toContain("# Design Style")
    expect(enCommands[0]?.content).toContain("- Reference: ")

    const zhSend = getMarkdownSlashCommands("/send", true, true, [], "zh")
    expect(zhSend[0]?.description).toBe("发送当前模板块 Prompt 到 Agent 或终端 CLI")

    const enSend = getMarkdownSlashCommands("/send", true, true, [], "en")
    expect(enSend[0]?.description).toBe(
      "Send current template block prompt to Agent or Terminal CLI",
    )
  })

  it("所有模板的 Notes 均在最下方，且 /bugTemplate 也包含 Notes", () => {
    const templates = getMarkdownSlashCommands("/", false, true, [], "en")
    const checkTemplates = [
      "addTemplate",
      "bugTemplate",
      "refactorTemplate",
      "commonTemplate",
      "styleTemplate",
    ]

    for (const id of checkTemplates) {
      const cmd = templates.find((c) => c.id === id)
      expect(cmd).toBeDefined()
      const content = cmd!.content
      expect(content).toContain("- Notes: ")

      const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
      const endMarkerIndex = lines.findIndex((l) => l.includes("--end"))
      expect(endMarkerIndex).toBeGreaterThan(0)
      // Notes 列表项必须位于结束标记之上
      expect(lines[endMarkerIndex - 2]).toBe("- Notes:")
      expect(lines[endMarkerIndex - 1]).toBe("-")
    }

    const bugCmd = templates.find((c) => c.id === "bugTemplate")!
    expect(bugCmd.content).toContain("- Reproduction: ")
    expect(bugCmd.content).toContain("- Expectations: ")
    expect(bugCmd.content).toContain("- Notes: ")
    // 验证 Expectations 在 Notes 之前
    expect(bugCmd.content.indexOf("- Expectations: ")).toBeLessThan(
      bugCmd.content.indexOf("- Notes: "),
    )

    const commonCmd = templates.find((c) => c.id === "commonTemplate")!
    expect(commonCmd.content.indexOf("- Expectations: ")).toBeLessThan(
      commonCmd.content.indexOf("- Notes: "),
    )

    const styleCmd = templates.find((c) => c.id === "styleTemplate")!
    expect(styleCmd.content.indexOf("- Expectations: ")).toBeLessThan(
      styleCmd.content.indexOf("- Notes: "),
    )
  })

  it("在 $$$ 变量模板块内仅允许 singleLine、multiLine 与 templatePreset 斜杠命令，并排除其余命令", () => {
    // 变量块内仅匹配 singleLine、multiLine、templatePreset
    const allVarCommands = getMarkdownSlashCommands("/", false, true, [], "zh", true)
    expect(allVarCommands.map((c) => c.id)).toEqual(["singleLine", "multiLine", "templatePreset"])

    // 关键字与模糊匹配
    expect(
      getMarkdownSlashCommands("/single", false, true, [], "zh", true).map((c) => c.id),
    ).toEqual(["singleLine"])
    expect(
      getMarkdownSlashCommands("/multi", false, true, [], "zh", true).map((c) => c.id),
    ).toEqual(["multiLine"])
    expect(
      getMarkdownSlashCommands("/preset", false, true, [], "zh", true).map((c) => c.id),
    ).toEqual(["templatePreset"])
    expect(getMarkdownSlashCommands("/sl", false, true, [], "zh", true).map((c) => c.id)).toEqual([
      "singleLine",
    ])
    expect(getMarkdownSlashCommands("/ml", false, true, [], "zh", true).map((c) => c.id)).toEqual([
      "multiLine",
      "templatePreset",
    ])
    expect(getMarkdownSlashCommands("/tp", false, true, [], "zh", true).map((c) => c.id)).toEqual([
      "templatePreset",
    ])

    // 其余所有命令（无论普通、模板还是全局）均不可用
    expect(getMarkdownSlashCommands("/var", false, true, [], "zh", true)).toEqual([])
    expect(getMarkdownSlashCommands("/add", false, true, [], "zh", true)).toEqual([])
    expect(getMarkdownSlashCommands("/git", false, true, [], "zh", true)).toEqual([])
    expect(getMarkdownSlashCommands("/send", false, true, [], "zh", true)).toEqual([])

    // 默认高亮选中 key
    const singleCmd = allVarCommands.find((c) => c.id === "singleLine")!
    expect(singleCmd.content).toBe('key: "value"')
    expect(singleCmd.selectionRange).toEqual({ start: 0, end: 3 })
    expect(
      singleCmd.content.slice(singleCmd.selectionRange!.start, singleCmd.selectionRange!.end),
    ).toBe("key")

    const multiCmd = allVarCommands.find((c) => c.id === "multiLine")!
    expect(multiCmd.content).toBe(["key:", '  """', "  var", '  """'].join("\n"))
    expect(multiCmd.selectionRange).toEqual({ start: 0, end: 3 })
    expect(
      multiCmd.content.slice(multiCmd.selectionRange!.start, multiCmd.selectionRange!.end),
    ).toBe("key")

    const presetCmd = allVarCommands.find((c) => c.id === "templatePreset")!
    expect(presetCmd.content).toContain("preset:")
    expect(presetCmd.content).toContain("reference:")
    expect(presetCmd.content).toContain('"""')

    // 变量块外禁止出现 singleLine、multiLine 与 templatePreset
    expect(getMarkdownSlashCommands("/single", false, true, [], "zh", false)).toEqual([])
    expect(getMarkdownSlashCommands("/multi", false, true, [], "zh", false)).toEqual([])
    expect(getMarkdownSlashCommands("/preset", false, true, [], "zh", false)).toEqual([])
    expect(getMarkdownSlashCommands("/single", true, true, [], "zh", false)).toEqual([])
    expect(
      getMarkdownSlashCommands("/preset", true, true, [], "zh", false).map((c) => c.id),
    ).toEqual(["applyPreset"])
    expect(
      getMarkdownSlashCommands("/", false, true, [], "zh", false).map((c) => c.id),
    ).not.toContain("templatePreset")
    expect(
      getMarkdownSlashCommands("/", true, true, [], "zh", false).map((c) => c.id),
    ).not.toContain("templatePreset")
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

  it("getTemplatePlaceholderSelectionRange: 解析并默认选中第一个 [xxx] 内部文本（不含中括号）", () => {
    expect(getTemplatePlaceholderSelectionRange("Hello world")).toBeNull()
    expect(getTemplatePlaceholderSelectionRange("## Target [feature]\nDetails: [details]")).toEqual(
      {
        start: 11,
        end: 18,
      },
    )
    expect(getTemplatePlaceholderSelectionRange("[only]")).toEqual({
      start: 1,
      end: 5,
    })
  })

  it("getMarkdownSlashCommands 支持带有 argumentHint 的自定义 Markdown 模板命令", () => {
    const customCommands = [
      {
        id: "custom:my-feature",
        label: "/my-feature",
        description: "自定义特性模板",
        argumentHint: "[feature-name]",
        content: "## Feature: [feature-name]\n\nDescription",
        cursorOffset: 35,
        scope: "both" as const,
        kind: "customTemplate" as const,
        source: "project" as const,
      },
    ]

    const matches = getMarkdownSlashCommands("/my", false, true, customCommands)
    expect(matches).toHaveLength(1)
    expect(matches[0].argumentHint).toBe("[feature-name]")
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
      {
        title: "opencode-dev",
        panes: { p1: { id: "p1", title: "opencode-dev", detectedCli: "opencode" as const } },
      },
      {
        title: "opencode-fix",
        panes: { p2: { id: "p2", title: "opencode-fix", detectedCli: "opencode" as const } },
      },
      {
        title: "cc-switch-main",
        panes: { p3: { id: "p3", title: "cc-switch-main", detectedCli: "claude" as const } },
      },
    ]
    const options = getMarkdownSendPromptOptions("zh", tabs)
    expect(options.some((o) => o.id === "opencode:opencode-dev" && o.isRunning)).toBe(true)
    expect(options.some((o) => o.id === "opencode:opencode-fix" && o.isRunning)).toBe(true)
    expect(options.some((o) => o.id === "lx" && o.targetType === "agent")).toBe(true)
    expect(options.some((o) => o.id === "opencode" && !o.isRunning)).toBe(true)

    // 打开两个完全同名的默认 opencode 终端
    const duplicateTabs = [
      {
        title: "opencode",
        panes: { p1: { id: "p1", title: "opencode", detectedCli: "opencode" as const } },
      },
      {
        title: "opencode",
        panes: { p2: { id: "p2", title: "opencode", detectedCli: "opencode" as const } },
      },
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
          "pane-1": { id: "pane-1", title: "OpenCode", detectedCli: "opencode" as const },
          "pane-2": { id: "pane-2", title: "OpenCode", detectedCli: "opencode" as const },
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
        panes: {
          "pane-1": {
            id: "pane-1",
            title: "opencode",
            detectedCli: "opencode" as const,
          },
        },
      },
      {
        title: "OpenCode",
        panes: {
          "pane-2": { id: "pane-2", title: "OpenCode", detectedCli: "opencode" as const },
        },
      },
      {
        title: "OpenCode",
        panes: {
          "pane-3": { id: "pane-3", title: "OpenCode", detectedCli: "opencode" as const },
        },
      },
    ]
    const mixedOptions = getMarkdownSendPromptOptions("zh", mixedTabs)
    expect(mixedOptions.filter((o) => o.isRunning).length).toBe(3)
    expect(mixedOptions.some((o) => o.label === "OpenCode:修复列表触底悬停时滚动条抖动")).toBe(true)
    expect(mixedOptions.some((o) => o.label === "OpenCode:#1")).toBe(true)
    expect(mixedOptions.some((o) => o.label === "OpenCode:#2")).toBe(true)

    // 已退出的终端（detectedCli 为 undefined，即便标题为 OpenCode 也绝不列为 running）
    const exitedTabs = [
      {
        title: "OpenCode",
        panes: {
          "pane-exited": { id: "pane-exited", title: "OpenCode", detectedCli: undefined },
        },
      },
    ]
    const exitedOptions = getMarkdownSendPromptOptions("zh", exitedTabs)
    expect(exitedOptions.filter((o) => o.isRunning).length).toBe(0)

    // 测试通过 detectedCli 检测出的 codex、gemini、agy（即使标题为默认 New Terminal）
    const detectedTabs = [
      {
        title: "New Terminal",
        panes: {
          "p-codex": { id: "p-codex", title: "New Terminal", detectedCli: "codex" as const },
          "p-gemini": { id: "p-gemini", title: "New Terminal", detectedCli: "gemini" as const },
          "p-agy": { id: "p-agy", title: "New Terminal", detectedCli: "agy" as const },
        },
      },
    ]
    const detectedOptions = getMarkdownSendPromptOptions("zh", detectedTabs)
    expect(detectedOptions.some((o) => o.targetType === "codex" && o.isRunning)).toBe(true)
    expect(detectedOptions.some((o) => o.targetType === "gemini" && o.isRunning)).toBe(true)
    expect(detectedOptions.some((o) => o.targetType === "agy" && o.isRunning)).toBe(true)

    // 验证静态 CLI 选项配置了多语言 description 说明
    const staticClaude = detectedOptions.find((o) => o.id === "claude" && !o.isRunning)
    expect(staticClaude?.description).toBe("新建并打开 Claude Code CLI")

    const detectedOptionsEn = getMarkdownSendPromptOptions("en", detectedTabs)
    const staticClaudeEn = detectedOptionsEn.find((o) => o.id === "claude" && !o.isRunning)
    expect(staticClaudeEn?.description).toBe("Create and launch Claude Code CLI")
  })

  it("getMarkdownSendPromptFlagOptions & parseMarkdownSendPromptCommandLine", () => {
    const flagsZh = getMarkdownSendPromptFlagOptions("zh")
    expect(flagsZh.some((f) => f.id === "-enter")).toBe(true)

    const flagsEn = getMarkdownSendPromptFlagOptions("en")
    expect(flagsEn.some((f) => f.id === "-enter")).toBe(true)

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

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt opencode:opencode-dev -enter ")).toEqual(
      {
        target: "opencode",
        instance: "opencode-dev",
        flag: "-enter",
      },
    )

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt claude -enter")).toEqual({
      target: "claude",
      instance: null,
      flag: "-enter",
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

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt codex:codex-task -enter")).toEqual({
      target: "codex",
      instance: "codex-task",
      flag: "-enter",
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

    expect(parseMarkdownSendPromptCommandLine("/sendPrompt grok:task-grok -enter")).toEqual({
      target: "grok",
      instance: "task-grok",
      flag: "-enter",
    })
  })

  it("getMarkdownSendPromptOptions 严格遵从 enabledCliIds 过滤静态项与运行中项", () => {
    const tabs = [
      {
        title: "opencode-dev",
        panes: { p1: { id: "p1", title: "opencode-dev", detectedCli: "opencode" as const } },
      },
      {
        title: "cc-switch-main",
        panes: { p2: { id: "p2", title: "cc-switch-main", detectedCli: "claude" as const } },
      },
    ]

    // 仅启用 claude
    const optionsClaudeOnly = getMarkdownSendPromptOptions("zh", tabs, ["claude"])
    expect(optionsClaudeOnly.some((o) => o.id === "lx")).toBe(true) // agent 始终可用
    expect(optionsClaudeOnly.some((o) => o.id === "claude" && !o.isRunning)).toBe(true)
    expect(optionsClaudeOnly.some((o) => o.targetType === "claude" && o.isRunning)).toBe(true)
    expect(optionsClaudeOnly.some((o) => o.id === "opencode")).toBe(false)
    expect(optionsClaudeOnly.some((o) => o.targetType === "opencode" && o.isRunning)).toBe(false)

    // 全部禁用 CLI，仅保留 Agent
    const optionsAgentOnly = getMarkdownSendPromptOptions("zh", tabs, [])
    expect(optionsAgentOnly.length).toBe(1)
    expect(optionsAgentOnly[0].id).toBe("lx")
  })
})
