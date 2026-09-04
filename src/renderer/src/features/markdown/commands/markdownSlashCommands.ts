import type { Locale } from "@shared/settings"
import { getCachedCliSettings } from "@/features/settings"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"

// Markdown 模板命令标识。
export type MarkdownTemplateCommandId =
  | "addTemplate"
  | "bugTemplate"
  | "refactorTemplate"
  | "commonTemplate"
  | "styleTemplate"
  | "suppleTemplate"
  | "logTemplate"

// Markdown 斜杠命令标识。
export type MarkdownSlashCommandId =
  | MarkdownTemplateCommandId
  | "summaryTitle"
  | "gitWorktree"
  | "sendPrompt"
  | (string & {})

// Markdown /sendPrompt 目标标识。
export type MarkdownSendPromptTargetId =
  | "agent"
  | "claude"
  | "opencode"
  | "codex"
  | "gemini"
  | "agy"
  | "grok"




// Markdown /sendPrompt 标志位标识。
export type MarkdownSendPromptFlagId = "-enter"

// Markdown /sendPrompt 二级选择目标选项配置。
export interface MarkdownSendPromptOption {
  id: string
  targetType: MarkdownSendPromptTargetId
  instanceName?: string
  name: string
  label: string
  description: string
  tag: string
  isDefault?: boolean
  isRunning?: boolean
}

// Markdown /sendPrompt 三级运行选项配置。
export interface MarkdownSendPromptFlagOption {
  id: MarkdownSendPromptFlagId
  name: string
  label: string
  description: string
  tag: string
}

// Markdown 斜杠命令可用范围：normal = 模板块外（文档正文），template = 模板块内，both = 两者皆可。
export type MarkdownSlashCommandScope = "normal" | "template" | "both"

// Markdown 斜杠命令触发类型：
// - direct = 面板选中即插入内容；
// - confirm = 回显命令文本、二次回车触发；
// - select = 回显命令文本后打开二级选择面板，选中回显值、再回车触发；
// - customTemplate = 自定义命令：直接在光标处插入内容。
export type MarkdownSlashCommandKind = "direct" | "confirm" | "select" | "customTemplate"

// Markdown 斜杠命令来源类型。
export type MarkdownSlashCommandSource = "builtin" | "project" | "user"

// Markdown 斜杠命令配置。
export interface MarkdownSlashCommand {
  id: MarkdownSlashCommandId
  label: string
  description: string
  content: string
  cursorOffset: number
  scope: MarkdownSlashCommandScope
  kind: MarkdownSlashCommandKind
  source?: MarkdownSlashCommandSource
  customScope?: "global" | "template"
}

// 斜杠命令行范围。
export interface MarkdownSlashCommandLine {
  from: number
  to: number
  value: string
}

/**
 * 计算模板插入内容在首个输入占位处的光标偏移量。
 */
const getTemplateCursorOffset = (content: string): number => {
  const lines = content.split("\n")
  let offset = 0
  for (const line of lines) {
    if (line.startsWith("- ") && (line.endsWith(": ") || line.endsWith("："))) {
      return offset + line.length
    }
    offset += line.length + 1
  }
  return content.length
}

/**
 * 根据语言环境构造内置 Markdown 模板命令。
 */
export const getBuiltinMarkdownSlashCommands = (locale: Locale = "zh"): MarkdownSlashCommand[] => {
  const dict = locale === "en" ? en : zh

  const addContent = dict.markdown.templateAddContent
  const bugContent = dict.markdown.templateBugContent
  const refactorContent = dict.markdown.templateRefactorContent
  const commonContent = dict.markdown.templateCommonContent
  const styleContent = dict.markdown.templateStyleContent
  const suppleContent = dict.markdown.templateSuppleContent
  const logContent = dict.markdown.templateLogContent

  const templates: MarkdownSlashCommand[] = [
    {
      id: "addTemplate",
      label: "/addTemplate",
      description: dict.markdown.templateAddDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: addContent,
      cursorOffset: getTemplateCursorOffset(addContent),
    },
    {
      id: "bugTemplate",
      label: "/bugTemplate",
      description: dict.markdown.templateBugDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: bugContent,
      cursorOffset: getTemplateCursorOffset(bugContent),
    },
    {
      id: "refactorTemplate",
      label: "/refactorTemplate",
      description: dict.markdown.templateRefactorDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: refactorContent,
      cursorOffset: getTemplateCursorOffset(refactorContent),
    },
    {
      id: "commonTemplate",
      label: "/commonTemplate",
      description: dict.markdown.templateCommonDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: commonContent,
      cursorOffset: getTemplateCursorOffset(commonContent),
    },
    {
      id: "styleTemplate",
      label: "/styleTemplate",
      description: dict.markdown.templateStyleDesc,
      scope: "normal",
      kind: "direct",
      source: "builtin",
      content: styleContent,
      cursorOffset: getTemplateCursorOffset(styleContent),
    },
  ]

  // 补充需求命令：仅在模板块内可用，直接替换当前行插入嵌套子块。
  const suppleTemplate: MarkdownSlashCommand = {
    id: "suppleTemplate",
    label: "/suppleTemplate",
    description: dict.markdown.templateSuppleDesc,
    scope: "template",
    kind: "direct",
    source: "builtin",
    content: suppleContent,
    cursorOffset: getTemplateCursorOffset(suppleContent),
  }

  // 运行日志命令：仅在模板块内可用，直接替换当前行插入嵌套日志块。
  const logTemplate: MarkdownSlashCommand = {
    id: "logTemplate",
    label: "/logTemplate",
    description: dict.markdown.templateLogDesc,
    scope: "template",
    kind: "direct",
    source: "builtin",
    content: logContent,
    cursorOffset: getTemplateCursorOffset(logContent),
  }

  const sendPrompt: MarkdownSlashCommand = {
    id: "sendPrompt",
    label: "/sendPrompt",
    description: dict.markdown.templateSendPromptDesc,
    scope: "template",
    kind: "select",
    source: "builtin",
    content: "/sendPrompt ",
    cursorOffset: "/sendPrompt ".length,
  }

  const summaryTitle: MarkdownSlashCommand = {
    id: "summaryTitle",
    label: "/summaryTitle",
    description: dict.markdown.templateSummaryTitleDesc,
    scope: "template",
    kind: "confirm",
    source: "builtin",
    content: "/summaryTitle ",
    cursorOffset: "/summaryTitle ".length,
  }

  const gitWorktree: MarkdownSlashCommand = {
    id: "gitWorktree",
    label: "/gitWorktree",
    description: dict.markdown.templateGitWorktreeDesc,
    scope: "both",
    kind: "select",
    source: "builtin",
    content: "/gitWorktree ",
    cursorOffset: "/gitWorktree ".length,
  }

  return [...templates, suppleTemplate, logTemplate, sendPrompt, summaryTitle, gitWorktree]
}

/**
 * 根据标题识别对应的 CLI 类型（如 opencode-dev -> opencode，OC | xxx -> opencode，cc-switch -> claude 等）。
 */
export const identifyCliTypeFromTitle = (title: string): MarkdownSendPromptTargetId | null => {
  const t = title.toLowerCase().trim()
  if (!t) return null
  if (
    t.includes("opencode") ||
    t.startsWith("oc ") ||
    t.startsWith("oc|") ||
    t.startsWith("oc |") ||
    t.startsWith("oc-") ||
    t.startsWith("oc:") ||
    t.includes("oc |") ||
    t.includes("oc -") ||
    t.includes("oc:") ||
    t === "oc"
  ) {
    return "opencode"
  }
  if (
    t.includes("claude") ||
    t.includes("claudecode") ||
    t.includes("cc-") ||
    t.startsWith("cc ") ||
    t.startsWith("cc|") ||
    t.startsWith("cc |") ||
    t.startsWith("cc:") ||
    t === "cc"
  ) {
    return "claude"
  }
  if (
    t.includes("codex") ||
    t.includes("openai") ||
    t.startsWith("cx ") ||
    t.startsWith("cx|") ||
    t.startsWith("cx |") ||
    t.startsWith("cx-") ||
    t.startsWith("cx:") ||
    t.includes("cx |") ||
    t.includes("cx -") ||
    t.includes("cx:") ||
    t === "cx"
  ) {
    return "codex"
  }
  if (
    t.includes("gemini") ||
    t.startsWith("gm ") ||
    t.startsWith("gm|") ||
    t.startsWith("gm |") ||
    t.startsWith("gm-") ||
    t.startsWith("gm:") ||
    t.includes("gm |") ||
    t.includes("gm -") ||
    t.includes("gm:") ||
    t === "gm"
  ) {
    return "gemini"
  }
  if (
    t.includes("agy") ||
    t.includes("antigravity") ||
    t.includes("anti-gravity") ||
    t.startsWith("ag ") ||
    t.startsWith("ag|") ||
    t.startsWith("ag |") ||
    t.startsWith("ag-") ||
    t.startsWith("ag:") ||
    t.includes("ag |") ||
    t.includes("ag -") ||
    t.includes("ag:") ||
    t === "ag"
  ) {
    return "agy"
  }
  if (
    t.includes("grok") ||
    t.startsWith("gk ") ||
    t.startsWith("gk|") ||
    t.startsWith("gk |") ||
    t.startsWith("gk-") ||
    t.startsWith("gk:") ||
    t.includes("gk |") ||
    t.includes("gk -") ||
    t.includes("gk:") ||
    t === "gk"
  ) {
    return "grok"
  }
  return null
}

/**
 * 判断标题是否属于未命名的默认 CLI / 终端名称。
 */
export const isDefaultCliTitle = (
  title: string,
  _cliType?: MarkdownSendPromptTargetId | null,
): boolean => {
  const t = title.trim().toLowerCase()
  if (!t) return true
  const defaultKeywords = [
    "opencode",
    "oc",
    "claude",
    "cc",
    "claudecode",
    "codex",
    "cx",
    "openai",
    "openai codex",
    "gemini",
    "gemini cli",
    "gemini-cli",
    "gm",
    "agy",
    "ag",
    "antigravity",
    "anti-gravity",
    "grok",
    "gk",
    "terminal",
    "new terminal",
    "zsh",
    "bash",
    "sh",
  ]
  return defaultKeywords.includes(t)
}




/**
 * 解析终端实例的有效标题与是否默认状态。
 */
export const resolveEffectiveCliTitle = (
  paneTitle: string,
  tabTitle: string,
  cliType: MarkdownSendPromptTargetId,
  hasMultiplePanes = false,
): { effectiveTitle: string; isDefault: boolean } => {
  const isPaneDefault = isDefaultCliTitle(paneTitle, cliType)
  const isTabDefault = isDefaultCliTitle(tabTitle, cliType)

  // 如果当前分屏 pane 自带非默认自定义标题，直接使用 paneTitle
  if (!isPaneDefault) {
    return { effectiveTitle: paneTitle, isDefault: false }
  }

  // 如果同一个 Tab 内有多个分屏 pane，且当前 pane 为默认标题（如 OpenCode），即使 tabTitle 被主分屏更新，当前 pane 依然是默认无标题分屏
  if (hasMultiplePanes) {
    return { effectiveTitle: paneTitle || "Terminal", isDefault: true }
  }

  // 单 pane 情况下，如果 tabTitle 有自定义标题，优先使用 tabTitle
  if (!isTabDefault) {
    return { effectiveTitle: tabTitle, isDefault: false }
  }

  return { effectiveTitle: paneTitle || tabTitle || "Terminal", isDefault: true }
}

/**
 * 根据语言环境与当前打开的终端列表获取 /sendPrompt 二级选择目标列表。
 * 若已存在打开的同名 CLI 实例，优先作为运行中选项列出。
 */
export const getMarkdownSendPromptOptions = (
  locale: Locale = "zh",
  tabs: {
    title: string
    panes?: Record<
      string,
      | {
          title?: string
          detectedCli?: MarkdownSendPromptTargetId
        }
      | undefined
    >
  }[] = [],
  enabledCliIds?: string[],
): MarkdownSendPromptOption[] => {
  const dict = locale === "en" ? en : zh
  const enabledSet = new Set(enabledCliIds ?? getCachedCliSettings().enabled)

  const options: MarkdownSendPromptOption[] = [
    {
      id: "lx",
      targetType: "agent",
      name: "LX Agent",
      label: "LX Agent",
      description: "",
      tag: "Default",
      isDefault: true,
    },
  ]

  // 1. 扫描当前打开的终端 Tab 与 Panes，提取已运行且在设置中启用的 CLI 实例
  const cliInstances: {
    cliType: MarkdownSendPromptTargetId
    effectiveTitle: string
    isDefault: boolean
  }[] = []

  for (const tab of tabs) {
    const tabTitle = tab.title || ""
    const rawPanes = tab.panes ? Object.values(tab.panes) : []
    const panes = rawPanes.filter((p): p is NonNullable<typeof p> => Boolean(p))
    const hasMultiplePanes = panes.length > 1


    if (panes.length > 0) {
      for (const pane of panes) {
        const paneTitle = pane.title || ""
        // 严格以实际检测出的 detectedCli 为准；只有检测到 CLI 运行时且在设置中启用才加入运行中列表
        const cliType = pane.detectedCli
        if (cliType && enabledSet.has(cliType)) {
          const { effectiveTitle, isDefault } = resolveEffectiveCliTitle(
            paneTitle,
            tabTitle,
            cliType,
            hasMultiplePanes,
          )
          cliInstances.push({ cliType, effectiveTitle, isDefault })
        }
      }
    }
  }

  // 2. 统计每个 CLI 下无标题实例序号，以及自定义标题的同名频次
  const defaultIndexCounter: Record<string, number> = {}
  const customTitleCounts: Record<string, number> = {}
  const customTitleSeen: Record<string, number> = {}

  for (const inst of cliInstances) {
    if (!inst.isDefault) {
      const key = `${inst.cliType}:${inst.effectiveTitle}`
      customTitleCounts[key] = (customTitleCounts[key] || 0) + 1
    }
  }

  const targetNameMap: Record<string, string> = {
    claude: "Claude Code",
    opencode: "OpenCode",
    codex: "Codex",
    gemini: "Gemini CLI",
    agy: "Antigravity",
    grok: "Grok Build",
    hermes: "Hermes",
  }

  for (const inst of cliInstances) {
    const displayName = targetNameMap[inst.cliType] || inst.cliType

    let instanceId: string
    let displayLabel: string
    let instanceName: string

    if (inst.isDefault) {
      defaultIndexCounter[inst.cliType] = (defaultIndexCounter[inst.cliType] || 0) + 1
      const idx = defaultIndexCounter[inst.cliType]
      instanceName = `#${idx}`
      instanceId = `${inst.cliType}:#${idx}`
      displayLabel = `${displayName}:#${idx}`
    } else {
      const key = `${inst.cliType}:${inst.effectiveTitle}`
      const total = customTitleCounts[key] || 1
      customTitleSeen[key] = (customTitleSeen[key] || 0) + 1
      const currentIdx = customTitleSeen[key]

      if (total > 1) {
        instanceName = `${inst.effectiveTitle}#${currentIdx}`
        instanceId = `${inst.cliType}:${instanceName}`
        displayLabel = `${displayName}:${inst.effectiveTitle} #${currentIdx}`
      } else {
        instanceName = inst.effectiveTitle
        instanceId = `${inst.cliType}:${instanceName}`
        displayLabel = `${displayName}:${inst.effectiveTitle}`
      }
    }

    options.push({
      id: instanceId,
      targetType: inst.cliType,
      instanceName,
      name: displayLabel,
      label: displayLabel,
      description: "",
      tag: dict.markdown.sendPromptRunningTag,
      isRunning: true,
    })
  }

  // 3. 追加通用静态目标（仅列出在设置中已启用的 CLI）
  const allStaticTargets: {
    id: MarkdownSendPromptTargetId
    name: string
    descriptionKey:
      | "sendPromptTargetClaudeDesc"
      | "sendPromptTargetOpencodeDesc"
      | "sendPromptTargetCodexDesc"
      | "sendPromptTargetGeminiDesc"
      | "sendPromptTargetAgyDesc"
      | "sendPromptTargetGrokDesc"
  }[] = [
    { id: "claude", name: "Claude Code", descriptionKey: "sendPromptTargetClaudeDesc" },
    { id: "opencode", name: "OpenCode", descriptionKey: "sendPromptTargetOpencodeDesc" },
    { id: "codex", name: "Codex", descriptionKey: "sendPromptTargetCodexDesc" },
    { id: "gemini", name: "Gemini CLI", descriptionKey: "sendPromptTargetGeminiDesc" },
    { id: "agy", name: "Antigravity", descriptionKey: "sendPromptTargetAgyDesc" },
    { id: "grok", name: "Grok Build", descriptionKey: "sendPromptTargetGrokDesc" },
  ]

  for (const staticTarget of allStaticTargets) {
    if (enabledSet.has(staticTarget.id)) {
      options.push({
        id: staticTarget.id,
        targetType: staticTarget.id,
        name: staticTarget.name,
        label: staticTarget.name,
        description: dict.markdown[staticTarget.descriptionKey],
        tag: "CLI",
      })
    }
  }

  return options
}

/**
 * 获取 Markdown /sendPrompt 命令三级运行选项配置列表。
 */
export const getMarkdownSendPromptFlagOptions = (
  locale: Locale = "zh",
): MarkdownSendPromptFlagOption[] => {
  const dict = locale === "en" ? en : zh
  return [
    {
      id: "-enter",
      name: "-enter",
      label: "-enter",
      description: dict.markdown.sendPromptFlagEnterDesc,
      tag: dict.markdown.sendPromptFlagEnterTag,
    },
  ]
}

export interface MarkdownSendPromptCommandParsed {
  target: MarkdownSendPromptTargetId
  instance: string | null
  flag: MarkdownSendPromptFlagId | null
}

/**
 * 解析 /sendPrompt 命令行中携带的目标、实例与可选标志位。
 * 支持：
 * - /sendPrompt agent
 * - /sendPrompt opencode
 * - /sendPrompt opencode:opencode-dev
 * - /sendPrompt opencode:opencode-dev -enter
 * - /sendPrompt opencode -enter
 */
export const parseMarkdownSendPromptCommandLine = (
  lineText: string,
): MarkdownSendPromptCommandParsed | null => {
  const trimmed = lineText.trim()
  if (!trimmed.startsWith("/sendPrompt")) return null

  const remainder = trimmed.slice("/sendPrompt".length).trim()
  if (!remainder) return null

  // 提取尾部可选的 Flag（如 -new）
  const flagMatch = /\s+(-[a-zA-Z0-9_-]+)$/.exec(remainder)
  const flag = (flagMatch ? flagMatch[1] : null) as MarkdownSendPromptFlagId | null
  const withoutFlag = flagMatch ? remainder.slice(0, flagMatch.index).trim() : remainder

  let rawTarget = withoutFlag
  let instance: string | null = null

  if (withoutFlag.includes(":")) {
    const colonIndex = withoutFlag.indexOf(":")
    rawTarget = withoutFlag.slice(0, colonIndex).trim()
    instance = withoutFlag.slice(colonIndex + 1).trim() || null
  }

  const normalizedTarget = rawTarget.toLowerCase()
  const target = (
    normalizedTarget === "lx" ||
    normalizedTarget === "lx agent" ||
    normalizedTarget === "lx-agent" ||
    normalizedTarget === "agent" ||
    normalizedTarget === "agentinput"
      ? "agent"
      : normalizedTarget === "claudecode" || normalizedTarget === "cc"
        ? "claude"
        : normalizedTarget === "oc"
          ? "opencode"
          : normalizedTarget === "openai" || normalizedTarget === "cx"
            ? "codex"
            : normalizedTarget === "gemini-cli" ||
                normalizedTarget === "geminicli" ||
                normalizedTarget === "gm"
              ? "gemini"
              : normalizedTarget === "antigravity" || normalizedTarget === "ag"
                ? "agy"
                : normalizedTarget === "grok" || normalizedTarget === "gk"
                  ? "grok"
                  : normalizedTarget
  ) as MarkdownSendPromptTargetId



  return { target, instance, flag }
}


// 默认内置命令（中文兜底与单测兼容）。
export const builtinMarkdownSlashCommands: MarkdownSlashCommand[] =
  getBuiltinMarkdownSlashCommands("zh")

// 全部斜杠命令（含确认型与选择型），供 armed 判定使用。
const markdownSlashCommands: MarkdownSlashCommand[] = [...builtinMarkdownSlashCommands]

// 斜杠命令名称的大小写不敏感子序列匹配。
const isFuzzyMatch = (query: string, keyword: string): boolean => {
  const normalizedQuery = query.toLowerCase()
  if (!normalizedQuery) return true

  let queryIndex = 0
  for (const character of keyword.toLowerCase()) {
    if (character === normalizedQuery[queryIndex]) queryIndex += 1
    if (queryIndex === normalizedQuery.length) return true
  }
  return false
}

/**
 * 判定光标行为已武装的斜杠命令行，返回对应命令：
 * - 确认型：行内容与某个确认命令标签完全一致且位于模板块内；
 * - 选择型：行以「/命令 值」形态存在（标签后带非空值），等待回车触发；
 * 已武装状态下命令面板不弹出，Enter 直接触发该命令。
 */
export const getMarkdownArmedSlashCommand = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
): MarkdownSlashCommand | null => {
  const value = lineValue.trim()
  const allCommands = [...markdownSlashCommands, ...customCommands]
  return (
    allCommands.find((command) => {
      if (command.kind === "confirm") {
        return isInsideTemplateBlock && command.label === value
      }
      if (command.kind === "select") {
        return value.startsWith(`${command.label} `) && value.length > command.label.length + 1
      }
      return false
    }) ?? null
  )
}

// 已武装的确认/选择命令行判定（兼容旧调用方）。
export const isMarkdownConfirmCommandArmed = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
): boolean =>
  getMarkdownArmedSlashCommand(lineValue, isInsideTemplateBlock, customCommands) !== null

// 提取选择型命令行携带的值（标签后的首个词）；非选择型或缺失时返回 null。
export const getMarkdownSelectCommandValue = (
  lineValue: string,
  isInsideTemplateBlock: boolean,
  customCommands: MarkdownSlashCommand[] = [],
): string | null => {
  const command = getMarkdownArmedSlashCommand(lineValue, isInsideTemplateBlock, customCommands)
  if (!command || command.kind !== "select") return null
  const value = lineValue.trim()
  const rest = value.slice(command.label.length).trim()
  return rest.length > 0 ? rest : null
}

/**
 * 获取光标所在行的斜杠命令范围。
 */
export const getMarkdownSlashCommandLine = (
  lineText: string,
  lineFrom: number,
  lineTo: number,
): MarkdownSlashCommandLine | null => {
  const value = lineText.trimStart()
  if (!value.startsWith("/")) return null

  return { from: lineFrom, to: lineTo, value }
}

/**
 * 获取与当前斜杠命令匹配的候选项；按光标所在上下文（模板块内/外）过滤命令可用范围。
 * isGitWorktreeAvailable 为 false 时排除 git 工作区切换命令（如 virtual 项目无 git 上下文）。
 * customCommands 支持传入自定义 Markdown 模板命令（已按 Project 覆盖 User 排序）。
 */
export const getMarkdownSlashCommands = (
  value: string,
  isInsideTemplateBlock = false,
  isGitWorktreeAvailable = true,
  customCommands: MarkdownSlashCommand[] = [],
  locale: Locale = "zh",
): MarkdownSlashCommand[] => {
  const match = /^\/([a-zA-Z0-9_-]*)$/i.exec(value)
  if (!match) return []

  const query = match[1].toLowerCase()
  const expectedScope: MarkdownSlashCommandScope = isInsideTemplateBlock ? "template" : "normal"
  const builtinCommands = getBuiltinMarkdownSlashCommands(locale)
  const allCommands = [...builtinCommands, ...customCommands]

  return allCommands.filter(
    (command) =>
      (command.scope === expectedScope || command.scope === "both") &&
      (isFuzzyMatch(query, command.id) || isFuzzyMatch(query, command.label.replace(/^\//, ""))) &&
      (command.id !== "gitWorktree" || isGitWorktreeAvailable),
  )
}

/**
 * 移除文本中包含的所有 Markdown 斜杠命令行（例如 /sendPrompt agent、/gitWorktree dev、/summaryTitle 等），
 * 保留该行的换行位置（置空该行文本），避免命令清除后破坏段落或标题的换行结构。
 */
export const stripMarkdownSlashCommands = (content: string): string =>
  content
    .split("\n")
    .map((line) => (/^\s*\/[a-zA-Z0-9_-]+(?:\s+.*)?$/.test(line) ? "" : line))
    .join("\n")
