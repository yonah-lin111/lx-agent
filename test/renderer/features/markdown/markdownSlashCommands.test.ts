import { describe, expect, it } from "vitest"
import {
  getMarkdownArmedSlashCommand,
  getMarkdownSelectCommandValue,
  getMarkdownSendPromptFlagOptions,
  getMarkdownSendPromptOptions,
  getMarkdownSlashCommandLine,
  getMarkdownSlashCommands,
  getTemplateCursorOffset,
  getTemplatePlaceholderSelectionRange,
  identifyCliTypeFromTitle,
  isDefaultCliTitle,
  parseMarkdownSendPromptCommandLine,
  resolveEffectiveCliTitle,
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
    expect(getMarkdownSlashCommands("/add", false).map((c) => c.id)).toEqual([
      "addTemplate",
      "addContent",
    ])
    expect(getMarkdownSlashCommands("/sum", false)).toEqual([])
    expect(getMarkdownSlashCommands("/git", false).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/", false).map((c) => c.id)).toEqual([
      "varTemplate",
      "addTemplate",
      "bugTemplate",
      "refactorTemplate",
      "commonTemplate",
      "styleTemplate",
      "addContent",
      "gitWorktree",
    ])
  })

  it("支持大小写不敏感的子序列模糊匹配", () => {
    expect(getMarkdownSlashCommands("/GWT", false).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/bugT", false).map((c) => c.id)).toEqual(["bugTemplate"])
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
    expect(getMarkdownSlashCommands("/add", true).map((c) => c.id)).toEqual(["addContent"])
    expect(getMarkdownSlashCommands("/git", true).map((c) => c.id)).toEqual(["gitWorktree"])
    expect(getMarkdownSlashCommands("/", true).map((c) => c.id)).toEqual([
      "suppleTemplate",
      "logTemplate",
      "addContent",
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
      "addContent",
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

  it("在 $$$ 变量模板块内仅允许 singleLine、multiLine 与 addContent 斜杠命令，并排除其余命令", () => {
    // 变量块内仅匹配 singleLine、multiLine、addContent（addContent 为全 page 作用域）
    const allVarCommands = getMarkdownSlashCommands("/", false, true, [], "zh", true)
    expect(allVarCommands.map((c) => c.id)).toEqual(["addContent", "singleLine", "multiLine"])

    // 关键字与模糊匹配
    expect(
      getMarkdownSlashCommands("/single", false, true, [], "zh", true).map((c) => c.id),
    ).toEqual(["singleLine"])
    expect(
      getMarkdownSlashCommands("/multi", false, true, [], "zh", true).map((c) => c.id),
    ).toEqual(["multiLine"])
    expect(
      getMarkdownSlashCommands("/addContent", false, true, [], "zh", true).map((c) => c.id),
    ).toEqual(["addContent"])
    expect(getMarkdownSlashCommands("/sl", false, true, [], "zh", true).map((c) => c.id)).toEqual([
      "singleLine",
    ])
    expect(getMarkdownSlashCommands("/ml", false, true, [], "zh", true).map((c) => c.id)).toEqual([
      "multiLine",
    ])

    // 其余所有命令（无论普通、模板还是全局）均不可用
    expect(getMarkdownSlashCommands("/var", false, true, [], "zh", true)).toEqual([])
    expect(getMarkdownSlashCommands("/bug", false, true, [], "zh", true)).toEqual([])
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

    // 变量块外禁止出现 singleLine、multiLine
    expect(getMarkdownSlashCommands("/single", false, true, [], "zh", false)).toEqual([])
    expect(getMarkdownSlashCommands("/multi", false, true, [], "zh", false)).toEqual([])
    expect(getMarkdownSlashCommands("/single", true, true, [], "zh", false)).toEqual([])
    expect(getMarkdownSlashCommands("/", false, true, [], "zh", false).map((c) => c.id)).toContain(
      "addContent",
    )
    expect(getMarkdownSlashCommands("/", true, true, [], "zh", false).map((c) => c.id)).toContain(
      "addContent",
    )
  })

  it("/addContent 为参数型全 page 命令，插入文本默认选中 [content]", () => {
    const commands = getMarkdownSlashCommands("/addContent", false, true, [], "zh")
    expect(commands).toHaveLength(1)
    const command = commands[0]
    expect(command.kind).toBe("argument")
    expect(command.scope).toBe("all")
    expect(command.argumentHint).toBe("[content]")
    expect(command.content).toBe("/addContent [content]")

    const range = getTemplatePlaceholderSelectionRange(command.content)
    expect(range).not.toBeNull()
    expect(command.content.slice(range!.start, range!.end)).toBe("content")
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

  it("参数型命令：/addContent 带值时全 page 武装，取值需由命令自身解析", () => {
    // 变量块内外均可武装（scope = all）
    expect(getMarkdownArmedSlashCommand("/addContent [@src/a.ts]", false, [], false)?.id).toBe(
      "addContent",
    )
    expect(getMarkdownArmedSlashCommand("/addContent [@src/a.ts]", true, [], false)?.id).toBe(
      "addContent",
    )
    expect(getMarkdownArmedSlashCommand("/addContent [@src/a.ts]", false, [], true)?.id).toBe(
      "addContent",
    )

    // 无参数不武装
    expect(getMarkdownArmedSlashCommand("/addContent", false)).toBeNull()
    expect(getMarkdownArmedSlashCommand("/addContent ", false)).toBeNull()

    // 参数型命令不属于 select，不参与 /gitWorktree 取值
    expect(getMarkdownSelectCommandValue("/addContent [@src/a.ts]", false)).toBeNull()

    // 其余作用域命令不受变量块标记影响
    expect(getMarkdownArmedSlashCommand("/gitWorktree feature-x", false, [], false)?.id).toBe(
      "gitWorktree",
    )
    expect(getMarkdownArmedSlashCommand("/sendPrompt agent", true, [], false)?.id).toBe(
      "sendPrompt",
    )
    expect(getMarkdownArmedSlashCommand("/summaryTitle", true, [], false)?.id).toBe("summaryTitle")
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
        title: "cc-prompt-tool-main",
        panes: { p3: { id: "p3", title: "cc-prompt-tool-main", detectedCli: "claude" as const } },
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
        title: "cc-prompt-tool-main",
        panes: { p2: { id: "p2", title: "cc-prompt-tool-main", detectedCli: "claude" as const } },
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

describe("Markdown 斜杠命令 CLI 标题识别", () => {
  it("identifyCliTypeFromTitle 识别各 CLI 的标题形态", () => {
    expect(identifyCliTypeFromTitle("opencode-dev")).toBe("opencode")
    expect(identifyCliTypeFromTitle("OC | 项目")).toBe("opencode")
    expect(identifyCliTypeFromTitle("oc")).toBe("opencode")

    expect(identifyCliTypeFromTitle("cc-prompt-tool")).toBe("claude")
    expect(identifyCliTypeFromTitle("Claude Code")).toBe("claude")

    expect(identifyCliTypeFromTitle("openai codex")).toBe("codex")
    expect(identifyCliTypeFromTitle("cx - 任务")).toBe("codex")

    expect(identifyCliTypeFromTitle("gemini cli")).toBe("gemini")
    expect(identifyCliTypeFromTitle("gm: 会话")).toBe("gemini")

    expect(identifyCliTypeFromTitle("antigravity")).toBe("agy")
    expect(identifyCliTypeFromTitle("ag - 窗口")).toBe("agy")

    expect(identifyCliTypeFromTitle("grok-cli")).toBe("grok")
    expect(identifyCliTypeFromTitle("gk|x")).toBe("grok")
  })

  it("identifyCliTypeFromTitle 无法识别时返回 null", () => {
    expect(identifyCliTypeFromTitle("")).toBeNull()
    expect(identifyCliTypeFromTitle("   ")).toBeNull()
    expect(identifyCliTypeFromTitle("我的终端")).toBeNull()
  })

  it("isDefaultCliTitle 判定默认与自定义标题", () => {
    expect(isDefaultCliTitle("")).toBe(true)
    expect(isDefaultCliTitle("  ")).toBe(true)
    expect(isDefaultCliTitle("OpenCode")).toBe(true)
    expect(isDefaultCliTitle("New Terminal")).toBe(true)
    expect(isDefaultCliTitle(" bash ")).toBe(true)
    expect(isDefaultCliTitle("我的项目终端")).toBe(false)
    expect(isDefaultCliTitle("auth 重构窗口")).toBe(false)
  })

  it("resolveEffectiveCliTitle 按 pane/tab 标题与分屏数解析有效标题", () => {
    // pane 自带自定义标题：优先 paneTitle。
    expect(resolveEffectiveCliTitle("auth 窗口", "opencode", "opencode")).toEqual({
      effectiveTitle: "auth 窗口",
      isDefault: false,
    })

    // 多分屏且 pane 为默认标题：保留 paneTitle 并标记默认。
    expect(resolveEffectiveCliTitle("opencode", "auth 窗口", "opencode", true)).toEqual({
      effectiveTitle: "opencode",
      isDefault: true,
    })
    expect(resolveEffectiveCliTitle("", "auth 窗口", "opencode", true)).toEqual({
      effectiveTitle: "Terminal",
      isDefault: true,
    })

    // 单分屏且 tab 有自定义标题：回退到 tabTitle。
    expect(resolveEffectiveCliTitle("opencode", "auth 窗口", "opencode")).toEqual({
      effectiveTitle: "auth 窗口",
      isDefault: false,
    })

    // 全部默认：兜底标题链。
    expect(resolveEffectiveCliTitle("opencode", "", "opencode")).toEqual({
      effectiveTitle: "opencode",
      isDefault: true,
    })
    expect(resolveEffectiveCliTitle("", "", "opencode")).toEqual({
      effectiveTitle: "Terminal",
      isDefault: true,
    })
  })

  it("getTemplateCursorOffset 定位列表占位符与空标题冒号", () => {
    expect(getTemplateCursorOffset("- 目标: \n- 约束: ")).toBe(6)
    expect(getTemplateCursorOffset("模板标题「title: 」\n- 内容")).toBe(12)
    expect(getTemplateCursorOffset("无占位符内容")).toBe(6)
  })
})
