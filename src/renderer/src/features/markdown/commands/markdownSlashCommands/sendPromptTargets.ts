import type { Locale } from "@shared/settings"
import { getCachedCliSettings } from "@/features/settings"
import { en } from "@/i18n/locales/en"
import { zh } from "@/i18n/locales/zh"
import type { MarkdownSendPromptOption, MarkdownSendPromptTargetId } from "./types"

/**
 * 根据标题识别对应的 CLI 类型（如 opencode-dev -> opencode，OC | xxx -> opencode，无关键字标题回退 claude 等）。
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
