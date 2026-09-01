import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import {
  isDefaultCliTitle,
  type MarkdownSendPromptTargetId,
} from "@/features/markdown/commands/markdownSlashCommands"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import type { TerminalTabItem } from "@/features/terminal/types"
import type { TranslationKey } from "@/i18n"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

// 派发提示词选项。
export interface DispatchPromptOptions {
  projectPath?: string
  worktreePath?: string
  isNew?: boolean
  t: (key: TranslationKey, options?: Record<string, unknown>) => string
  showToast?: {
    success: (msg: string) => void
    error: (msg: string) => void
    warning?: (msg: string) => void
  }
}

/**
 * 校验标题是否匹配指定 CLI 关键字（支持 tab 标题与 pane 标题）。
 */
export const isTitleMatchingCli = (cliTarget: string, title: string): boolean => {
  const t = title.toLowerCase().trim()
  if (!t) return false
  switch (cliTarget) {
    case "opencode":
      return (
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
      )
    case "claude":
      return (
        t.includes("claude") ||
        t.includes("claudecode") ||
        t.includes("cc-") ||
        t.startsWith("cc ") ||
        t.startsWith("cc|") ||
        t.startsWith("cc |") ||
        t.startsWith("cc:") ||
        t === "cc"
      )
    case "codex":
      return (
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
      )
    case "gemini":
      return (
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
      )
    case "agy":
      return (
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
      )
    default:
      return t.includes(cliTarget.toLowerCase())
  }
}

export interface MatchingCliPaneEntry {
  tabId: string
  paneId: string
  title: string
  tabTitle: string
  paneTitle: string
}

/**
 * 收集所有 Tab 与分屏 Pane 中匹配目标 CLI 的终端实例列表。
 */
export const collectMatchingCliPanes = (
  cliTarget: string,
  tabs: TerminalTabItem[],
): MatchingCliPaneEntry[] => {
  const result: MatchingCliPaneEntry[] = []
  for (const tab of tabs) {
    const tabPanes = Object.values(tab.panes || {})
    const tabTitle = tab.title?.trim() || ""
    if (tabPanes.length > 0) {
      for (const pane of tabPanes) {
        const paneTitle = pane.title?.trim() || ""
        const effectiveTitle = paneTitle || tabTitle || "Terminal"
        if (
          isTitleMatchingCli(cliTarget, paneTitle) ||
          isTitleMatchingCli(cliTarget, tabTitle)
        ) {
          result.push({
            tabId: tab.id,
            paneId: pane.id,
            title: effectiveTitle,
            tabTitle,
            paneTitle,
          })
        }
      }
    } else {
      if (isTitleMatchingCli(cliTarget, tabTitle)) {
        result.push({
          tabId: tab.id,
          paneId: tab.activePaneId || "",
          title: tabTitle,
          tabTitle,
          paneTitle: "",
        })
      }
    }
  }
  return result
}

/**
 * 在所有终端 Tab 与 Pane 中查找匹配目标 CLI 或指定实例名的运行中终端。
 */
export const findMatchingCliPane = (
  cliTarget: string,
  tabs: TerminalTabItem[],
  instanceName?: string | null,
): { tabId: string; paneId: string } | null => {
  const allMatching = collectMatchingCliPanes(cliTarget, tabs)
  if (allMatching.length === 0) return null

  if (instanceName) {
    const trimmedInst = instanceName.trim()

    // 检查是否包含序号后缀，如 #1, #2 或 opencode#2
    const indexedMatch = /^(.*?)(?:#(\d+))$/.exec(trimmedInst)
    if (indexedMatch) {
      const baseName = indexedMatch[1].trim().toLowerCase()
      const targetIndex = parseInt(indexedMatch[2], 10)

      if (!baseName) {
        // 无自定义前缀（如 #1 / #2），优先匹配未命名的默认 CLI 实例
        const untitledPanes = allMatching.filter((item) =>
          isDefaultCliTitle(item.title, cliTarget as MarkdownSendPromptTargetId),
        )
        if (untitledPanes.length >= targetIndex && targetIndex >= 1) {
          const targetItem = untitledPanes[targetIndex - 1]
          if (targetItem.paneId) return { tabId: targetItem.tabId, paneId: targetItem.paneId }
        }
      }

      const matchedByBase = allMatching.filter((item) => {
        if (baseName) {
          return (
            item.title.toLowerCase().includes(baseName) ||
            item.tabTitle.toLowerCase().includes(baseName) ||
            item.paneTitle.toLowerCase().includes(baseName)
          )
        }
        return true
      })

      if (matchedByBase.length >= targetIndex && targetIndex >= 1) {
        const targetItem = matchedByBase[targetIndex - 1]
        if (targetItem.paneId) return { tabId: targetItem.tabId, paneId: targetItem.paneId }
      }
    }

    const instLower = trimmedInst.toLowerCase()
    // 优先匹配指定实例名称的 Pane（匹配 title、tabTitle 或 paneTitle）
    const found = allMatching.find(
      (item) =>
        item.title.toLowerCase().includes(instLower) ||
        item.tabTitle.toLowerCase().includes(instLower) ||
        item.paneTitle.toLowerCase().includes(instLower),
    )
    if (found && found.paneId) {
      return { tabId: found.tabId, paneId: found.paneId }
    }
  }

  // 通用 CLI 类型匹配：取首个匹配 Pane
  const first = allMatching[0]
  if (first && first.paneId) {
    return { tabId: first.tabId, paneId: first.paneId }
  }
  return null
}

/**
 * 安全转义 POSIX Shell 单引号参数。
 */
export const escapeShellArg = (arg: string): string => `'${arg.replace(/'/g, "'\\''")}'`

/**
 * 派发模板块 Prompt 到指定目标（AgentInput 或终端 CLI）。
 */
export const dispatchTemplatePrompt = async (
  rawTarget: string,
  prompt: string,
  options: DispatchPromptOptions,
): Promise<boolean> => {
  const cleanPrompt = prompt.trim()
  if (!cleanPrompt) {
    options.showToast?.error(options.t("markdown.promptSendFailedEmpty"))
    return false
  }

  const rawTrimmed = rawTarget.trim()
  let targetType = rawTrimmed.toLowerCase()
  let instanceName: string | null = null

  if (targetType.includes(":")) {
    const colonIndex = rawTrimmed.indexOf(":")
    targetType = rawTrimmed.slice(0, colonIndex).toLowerCase().trim()
    instanceName = rawTrimmed.slice(colonIndex + 1).trim()
  }

  // 1. 发送到 Agent 对话框 (lx / lx agent / lx-agent / agent / agentinput)
  if (
    targetType === "lx" ||
    targetType === "lx agent" ||
    targetType === "lx-agent" ||
    targetType === "agent" ||
    targetType === "agentinput"
  ) {
    rightSidebarStore.setCollapsed(false)
    agentTabStore.insertPromptToActiveTab(cleanPrompt)
    options.showToast?.success(options.t("markdown.promptFilledToAgent"))
    return true
  }

  // 2. 发送到终端 CLI（Claude Code / OpenCode / Codex / Gemini CLI / Antigravity）
  const cliTarget =
    targetType === "agy" || targetType === "antigravity" || targetType === "ag"
      ? "agy"
      : targetType === "gemini" || targetType === "gemini-cli" || targetType === "gm"
        ? "gemini"
        : targetType === "claude" || targetType === "claudecode" || targetType === "cc"
          ? "claude"
          : targetType === "codex" || targetType === "openai" || targetType === "cx"
            ? "codex"
            : targetType === "opencode" || targetType === "oc"
              ? "opencode"
              : null

  if (!cliTarget) {
    options.showToast?.error(`Unsupported target: ${rawTarget}`)
    return false
  }

  // 唤起底边栏并切到终端视图
  useBottomSideBarStore.getState().setExpanded(true)
  useBottomSideBarStore.getState().setViewMode("terminal")

  const targetCwd = options.worktreePath || options.projectPath || undefined
  const terminalStore = useTerminalStore.getState()

  const targetNameMap: Record<string, string> = {
    claude: "Claude Code",
    opencode: "OpenCode",
    codex: "Codex",
    gemini: "Gemini CLI",
    agy: "Antigravity",
  }
  const displayTargetName = targetNameMap[cliTarget] || cliTarget
  const toastDisplayName = instanceName ? `${displayTargetName} (${instanceName})` : displayTargetName

  // 检查是否未显式要求新建，且存在已打开的对应 CLI / 实例终端
  const matched = !options.isNew
    ? findMatchingCliPane(cliTarget, terminalStore.tabs, instanceName)
    : null

  // Case A: 找到已打开的 CLI / 实例终端 Pane ➔ 聚焦并使用 Bracketed Paste 回显到输入框（不自动发送回车）
  if (matched) {
    terminalStore.setActiveTab(matched.tabId)
    terminalStore.setActivePane(matched.tabId, matched.paneId)
    // 括号粘贴模式注入多行 Prompt（不带 \r，保留在输入框等待人工回车）
    await terminalApi.write(matched.paneId, `\x1b[200~${cleanPrompt}\x1b[201~`)
    options.showToast?.success(
      options.t("markdown.promptEchoedToTerminal", { target: toastDisplayName }),
    )
    return true
  }

  // Case B: 显式要求新建 (-new) 或未找到已运行的同名 CLI ➔ 准备终端执行
  let targetTabId = terminalStore.activeTabId
  let targetPaneId: string | null = null

  if (options.isNew || terminalStore.tabs.length === 0) {
    // 显式新建或无终端：直接新建 Tab
    targetTabId = terminalStore.addTab({ cwd: targetCwd, title: toastDisplayName })
    const newTab = useTerminalStore.getState().tabs.find((t) => t.id === targetTabId)
    targetPaneId = newTab?.activePaneId ?? null
  } else {
    const currentTab =
      terminalStore.tabs.find((t) => t.id === targetTabId) ?? terminalStore.tabs[0]
    targetTabId = currentTab.id
    const currentPaneId = currentTab.activePaneId || Object.keys(currentTab.panes)[0]

    const isBusy = currentPaneId
      ? await terminalApi.hasRunningProcess(currentPaneId).catch(() => false)
      : false

    if (isBusy) {
      // 占用中，分屏新建隔离终端
      const splitId = terminalStore.splitPane(targetTabId, "horizontal", targetCwd)
      if (splitId) {
        targetPaneId = splitId
      } else {
        targetTabId = terminalStore.addTab({ cwd: targetCwd, title: toastDisplayName })
        const newTab = useTerminalStore.getState().tabs.find((t) => t.id === targetTabId)
        targetPaneId = newTab?.activePaneId ?? null
      }
    } else {
      targetPaneId = currentPaneId
    }
  }

  if (!targetPaneId) return false

  // 拼装 Shell 启动命令
  const escaped = escapeShellArg(cleanPrompt)
  let launchCmd = ""
  switch (cliTarget) {
    case "claude":
      launchCmd = `claude ${escaped}`
      break
    case "opencode":
      launchCmd = `opencode run ${escaped}`
      break
    case "codex":
      launchCmd = `codex ${escaped}`
      break
    case "gemini":
      launchCmd = `gemini ${escaped}`
      break
    case "agy":
      launchCmd = `agy ${escaped}`
      break
  }

  setTimeout(() => {
    if (targetPaneId) {
      void terminalApi.write(targetPaneId, `${launchCmd}\r`)
    }
  }, 60)

  options.showToast?.success(
    options.t("markdown.promptSentToTerminal", { target: toastDisplayName }),
  )
  return true
}
