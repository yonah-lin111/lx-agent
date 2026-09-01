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
  autoEnter?: boolean
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
          pane.detectedCli === cliTarget ||
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
 * 启动新的终端 CLI 会话（不派发 Prompt 内容，仅打开并运行该 CLI）。
 * 支持 auto（自动按空闲/水平分屏）、horizontal（向右分屏）、vertical（向下分屏）、tab（新建标签页）。
 */
export const launchNewCliTerminal = async (
  cliTarget: string,
  options: {
    projectPath?: string
    worktreePath?: string
    title?: string
    mode?: "auto" | "horizontal" | "vertical" | "tab"
  },
): Promise<{ tabId: string; paneId: string } | null> => {
  // 唤起底边栏并切到终端视图（但不抢占编辑器焦点）
  useBottomSideBarStore.getState().setExpanded(true)
  useBottomSideBarStore.getState().setViewMode("terminal")

  const targetCwd = options.worktreePath || options.projectPath || undefined
  const terminalStore = useTerminalStore.getState()
  const targetTitle = options.title || cliTarget
  const mode = options.mode || "auto"

  let targetTabId = terminalStore.activeTabId
  let targetPaneId: string | null = null

  if (mode === "tab" || terminalStore.tabs.length === 0) {
    targetTabId = terminalStore.addTab({ cwd: targetCwd, title: targetTitle })
    const newTab = useTerminalStore.getState().tabs.find((t) => t.id === targetTabId)
    targetPaneId = newTab?.activePaneId ?? null
  } else if (mode === "horizontal" || mode === "vertical") {
    const currentTab =
      terminalStore.tabs.find((t) => t.id === targetTabId) ?? terminalStore.tabs[0]
    targetTabId = currentTab.id
    const splitId = terminalStore.splitPane(targetTabId, mode, targetCwd)
    if (splitId) {
      targetPaneId = splitId
    } else {
      targetTabId = terminalStore.addTab({ cwd: targetCwd, title: targetTitle })
      const newTab = useTerminalStore.getState().tabs.find((t) => t.id === targetTabId)
      targetPaneId = newTab?.activePaneId ?? null
    }
  } else {
    // mode === "auto"
    const currentTab =
      terminalStore.tabs.find((t) => t.id === targetTabId) ?? terminalStore.tabs[0]
    targetTabId = currentTab.id
    const currentPaneId = currentTab.activePaneId || Object.keys(currentTab.panes)[0]

    const isBusy = currentPaneId
      ? await terminalApi.hasRunningProcess(currentPaneId).catch(() => false)
      : false

    if (isBusy) {
      const splitId = terminalStore.splitPane(targetTabId, "horizontal", targetCwd)
      if (splitId) {
        targetPaneId = splitId
      } else {
        targetTabId = terminalStore.addTab({ cwd: targetCwd, title: targetTitle })
        const newTab = useTerminalStore.getState().tabs.find((t) => t.id === targetTabId)
        targetPaneId = newTab?.activePaneId ?? null
      }
    } else {
      targetPaneId = currentPaneId
    }
  }

  if (!targetPaneId) return null

  // 发送启动命令进入交互式 CLI
  setTimeout(() => {
    if (targetPaneId) {
      void terminalApi.write(targetPaneId, `${cliTarget}\r`)
      // 启动后即刻请求刷新检测
      setTimeout(() => {
        void useTerminalStore.getState().refreshRunningClis()
      }, 100)
    }
  }, 60)

  return { tabId: targetTabId, paneId: targetPaneId }
}
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

  // 检查是否存在已打开的对应 CLI / 实例终端
  const matched = findMatchingCliPane(cliTarget, terminalStore.tabs, instanceName)

  // Case A: 找到已打开的 CLI / 实例终端 Pane ➔ 聚焦并使用 Bracketed Paste 回显到输入框
  if (matched) {
    terminalStore.setActiveTab(matched.tabId)
    terminalStore.setActivePane(matched.tabId, matched.paneId)
    // 括号粘贴模式注入多行 Prompt（根据 autoEnter 决定是否自动追加回车发送）
    const pastePayload = options.autoEnter
      ? `\x1b[200~${cleanPrompt}\x1b[201~\r`
      : `\x1b[200~${cleanPrompt}\x1b[201~`
    await terminalApi.write(matched.paneId, pastePayload)
    const successMsg = options.autoEnter
      ? options.t("markdown.promptSentToTerminal", { target: toastDisplayName })
      : options.t("markdown.promptEchoedToTerminal", { target: toastDisplayName })
    options.showToast?.success(successMsg)
    return true
  }

  // Case B: 未找到已运行的同名 CLI ➔ 准备终端执行
  let targetTabId = terminalStore.activeTabId
  let targetPaneId: string | null = null

  if (terminalStore.tabs.length === 0) {
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

  // 纯交互式启动 CLI（如 opencode、claude、codex 等），进入后以 Bracketed Paste 填充 Prompt 到输入框
  const launchCmd = cliTarget

  // 1. 发送交互式 CLI 启动命令
  setTimeout(() => {
    if (targetPaneId) {
      void terminalApi.write(targetPaneId, `${launchCmd}\r`)
    }
  }, 60)

  // 2. 等待 CLI 启动完成后，将多行内容安全粘贴到其输入框（根据 autoEnter 决定是否回车执行）
  setTimeout(() => {
    if (targetPaneId) {
      const pastePayload = options.autoEnter
        ? `\x1b[200~${cleanPrompt}\x1b[201~\r`
        : `\x1b[200~${cleanPrompt}\x1b[201~`
      void terminalApi.write(targetPaneId, pastePayload)
    }
  }, 350)

  const successMsg = options.autoEnter
    ? options.t("markdown.promptSentToTerminal", { target: toastDisplayName })
    : options.t("markdown.promptEchoedToTerminal", { target: toastDisplayName })
  options.showToast?.success(successMsg)
  return true
}
