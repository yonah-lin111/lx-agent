import { beforeEach, describe, expect, it, vi } from "vitest"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import {
  dispatchTemplatePrompt,
  escapeShellArg,
  launchNewCliTerminal,
} from "@/features/markdown/utils/markdownSendPromptDispatcher"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { useTerminalStore } from "@/features/terminal/terminalStore"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

describe("markdownSendPromptDispatcher", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useBottomSideBarStore.setState({ isExpanded: false, viewMode: "terminal" })
    rightSidebarStore.setCollapsed(true)
  })

  describe("escapeShellArg", () => {
    it("正确包裹单引号并转义单引号字符", () => {
      expect(escapeShellArg("hello")).toBe("'hello'")
      expect(escapeShellArg("hello world")).toBe("'hello world'")
      expect(escapeShellArg("it's cool")).toBe("'it'\\''s cool'")
      expect(escapeShellArg("line1\nline2")).toBe("'line1\nline2'")
    })
  })

  describe("dispatchTemplatePrompt", () => {
    const mockT = (key: string, options?: Record<string, unknown>) => {
      if (options?.target) return `${key}:${options.target}`
      return key
    }

    it("空 Prompt 时阻断发送并提示错误", async () => {
      const errorToast = vi.fn()
      const successToast = vi.fn()

      const result = await dispatchTemplatePrompt("agent", "   ", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(false)
      expect(errorToast).toHaveBeenCalledWith("markdown.promptSendFailedEmpty")
      expect(successToast).not.toHaveBeenCalled()
    })

    it("目标为 agent 或 lx 时展开右侧栏并填充至激活 Agent Tab 输入框", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()

      const activeTabId = agentTabStore.getActiveTabId()
      const inputSetter = vi.fn()
      agentTabStore.registerInputSetter(activeTabId, inputSetter)

      const result = await dispatchTemplatePrompt("lx", "# 需求详情", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(rightSidebarStore.isCollapsed()).toBe(false)
      expect(inputSetter).toHaveBeenCalled()
      expect(successToast).toHaveBeenCalledWith("markdown.promptFilledToAgent")
    })

    it("目标为 claude 且已存在运行中的 Claude 终端时使用 Bracketed Paste 回显至输入框（不自动回车）", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

      // 设置终端已有 Claude Tab (tab title: cc-switch-main)
      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-claude",
            title: "cc-switch-main",
            panes: {
              "pane-claude": {
                id: "pane-claude",
                title: "zsh",
                createdAt: Date.now(),
              },
            },
            rootNode: { type: "leaf", paneId: "pane-claude" },
            activePaneId: "pane-claude",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-claude",
      })

      const result = await dispatchTemplatePrompt("claude", "优化代码结构", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(useBottomSideBarStore.getState().isExpanded).toBe(true)
      expect(useBottomSideBarStore.getState().viewMode).toBe("terminal")
      expect(writeSpy).toHaveBeenCalledWith(
        "pane-claude",
        "\x1b[200~优化代码结构\x1b[201~",
      )
      expect(successToast).toHaveBeenCalledWith("markdown.promptEchoedToTerminal:Claude Code")
    })

    it("指定 autoEnter: true 时将注入 Prompt 并追加回车自动执行", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-claude",
            title: "Claude Code",
            panes: {
              "pane-claude": { id: "pane-claude", title: "claude", createdAt: Date.now() },
            },
            rootNode: { type: "leaf", paneId: "pane-claude" },
            activePaneId: "pane-claude",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-claude",
      })

      const result = await dispatchTemplatePrompt("claude", "优化代码结构", {
        autoEnter: true,
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(useBottomSideBarStore.getState().isExpanded).toBe(true)
      expect(useBottomSideBarStore.getState().viewMode).toBe("terminal")
      expect(writeSpy).toHaveBeenCalledWith(
        "pane-claude",
        "\x1b[200~优化代码结构\x1b[201~\r",
      )
      expect(successToast).toHaveBeenCalledWith("markdown.promptSentToTerminal:Claude Code")
    })

    it("存在多个同名 CLI 时，支持通过 opencode:instance 语法精确路由到指定实例", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-1",
            title: "opencode-dev",
            panes: {
              "pane-1": { id: "pane-1", title: "opencode", createdAt: Date.now() },
            },
            rootNode: { type: "leaf", paneId: "pane-1" },
            activePaneId: "pane-1",
            createdAt: Date.now(),
          },
          {
            id: "tab-2",
            title: "opencode-fix",
            panes: {
              "pane-2": { id: "pane-2", title: "opencode", createdAt: Date.now() },
            },
            rootNode: { type: "leaf", paneId: "pane-2" },
            activePaneId: "pane-2",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-1",
      })

      const result = await dispatchTemplatePrompt("opencode:opencode-fix", "修复特定缺陷", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(useTerminalStore.getState().activeTabId).toBe("tab-2")
      expect(writeSpy).toHaveBeenCalledWith("pane-2", "\x1b[200~修复特定缺陷\x1b[201~")
      expect(successToast).toHaveBeenCalledWith(
        "markdown.promptEchoedToTerminal:OpenCode (opencode-fix)",
      )
    })

    it("存在多个同名 opencode 时，支持通过 opencode:opencode#2 路由到第2个同名实例", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-dup-1",
            title: "opencode",
            panes: {
              "pane-dup-1": { id: "pane-dup-1", title: "opencode", createdAt: Date.now() },
            },
            rootNode: { type: "leaf", paneId: "pane-dup-1" },
            activePaneId: "pane-dup-1",
            createdAt: Date.now(),
          },
          {
            id: "tab-dup-2",
            title: "opencode",
            panes: {
              "pane-dup-2": { id: "pane-dup-2", title: "opencode", createdAt: Date.now() },
            },
            rootNode: { type: "leaf", paneId: "pane-dup-2" },
            activePaneId: "pane-dup-2",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-dup-1",
      })

      const result = await dispatchTemplatePrompt("opencode:#2", "发送给第二个同名实例", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(useTerminalStore.getState().activeTabId).toBe("tab-dup-2")
      expect(writeSpy).toHaveBeenCalledWith("pane-dup-2", "\x1b[200~发送给第二个同名实例\x1b[201~")
      expect(successToast).toHaveBeenCalledWith(
        "markdown.promptEchoedToTerminal:OpenCode (#2)",
      )
    })

    it("同一个 Tab 内存在左右分屏的两个 OpenCode 时，支持精准路由到第 2 个分屏 Pane", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-split",
            title: "OpenCode",
            panes: {
              "pane-left": { id: "pane-left", title: "OpenCode", createdAt: Date.now() },
              "pane-right": { id: "pane-right", title: "OpenCode", createdAt: Date.now() },
            },
            rootNode: {
              type: "branch",
              id: "branch-1",
              direction: "horizontal",
              ratio: 0.5,
              children: [
                { type: "leaf", paneId: "pane-left" },
                { type: "leaf", paneId: "pane-right" },
              ],
            },
            activePaneId: "pane-left",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-split",
      })

      const result = await dispatchTemplatePrompt("opencode:#2", "发送给右侧分屏", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(writeSpy).toHaveBeenCalledWith("pane-right", "\x1b[200~发送给右侧分屏\x1b[201~")
      expect(successToast).toHaveBeenCalledWith(
        "markdown.promptEchoedToTerminal:OpenCode (#2)",
      )
    })

    it("目标为 opencode/codex/agy 且无匹配终端时在空闲终端启动对应 CLI", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()
      vi.spyOn(terminalApi, "hasRunningProcess").mockResolvedValue(false)

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-shell",
            title: "zsh",
            panes: {
              "pane-shell": {
                id: "pane-shell",
                title: "zsh",
                createdAt: Date.now(),
              },
            },
            rootNode: { type: "leaf", paneId: "pane-shell" },
            activePaneId: "pane-shell",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-shell",
      })

      const result = await dispatchTemplatePrompt("opencode", "测试任务", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })

      expect(result).toBe(true)
      expect(successToast).toHaveBeenCalledWith("markdown.promptEchoedToTerminal:OpenCode")

      // 等待 timeout 执行
      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(writeSpy).toHaveBeenCalledWith("pane-shell", "opencode\r")
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(writeSpy).toHaveBeenCalledWith("pane-shell", "\x1b[200~测试任务\x1b[201~")
    })

    it("支持将 Prompt 派发至 gemini / codex / agy 终端", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()
      vi.spyOn(terminalApi, "hasRunningProcess").mockResolvedValue(false)

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-gemini",
            title: "gemini-cli",
            panes: {
              "pane-gemini": { id: "pane-gemini", title: "gemini", createdAt: Date.now() },
            },
            rootNode: { type: "leaf", paneId: "pane-gemini" },
            activePaneId: "pane-gemini",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-gemini",
      })

      const geminiResult = await dispatchTemplatePrompt("gemini", "Gemini 提示词", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })
      expect(geminiResult).toBe(true)
      expect(writeSpy).toHaveBeenCalledWith("pane-gemini", "\x1b[200~Gemini 提示词\x1b[201~")
      expect(successToast).toHaveBeenCalledWith("markdown.promptEchoedToTerminal:Gemini CLI")
    })

    it("当终端通过 detectedCli 识别出 codex / agy 时能够正确匹配并使用 Bracketed Paste 回显", async () => {
      const successToast = vi.fn()
      const errorToast = vi.fn()
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-generic",
            title: "New Terminal",
            panes: {
              "pane-codex": {
                id: "pane-codex",
                title: "New Terminal",
                detectedCli: "codex",
                createdAt: Date.now(),
              },
            },
            rootNode: { type: "leaf", paneId: "pane-codex" },
            activePaneId: "pane-codex",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-generic",
      })

      const codexResult = await dispatchTemplatePrompt("codex", "Codex 提示词", {
        t: mockT,
        showToast: { error: errorToast, success: successToast },
      })
      expect(codexResult).toBe(true)
      expect(writeSpy).toHaveBeenCalledWith("pane-codex", "\x1b[200~Codex 提示词\x1b[201~")
      expect(successToast).toHaveBeenCalledWith("markdown.promptEchoedToTerminal:Codex")
    })

    it("launchNewCliTerminal 支持 auto / horizontal / vertical / tab 模式并正确分屏或建 Tab", async () => {
      const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()
      vi.spyOn(terminalApi, "hasRunningProcess").mockResolvedValue(false)

      useTerminalStore.setState({
        tabs: [
          {
            id: "tab-1",
            title: "Default",
            panes: { "pane-1": { id: "pane-1", title: "zsh", createdAt: Date.now() } },
            rootNode: { type: "leaf", paneId: "pane-1" },
            activePaneId: "pane-1",
            createdAt: Date.now(),
          },
        ],
        activeTabId: "tab-1",
      })

      // 1. horizontal 分屏
      const horizRes = await launchNewCliTerminal("opencode", { mode: "horizontal" })
      expect(horizRes).not.toBeNull()
      expect(Object.keys(useTerminalStore.getState().tabs[0].panes).length).toBe(2)

      // 2. vertical 分屏
      const vertRes = await launchNewCliTerminal("claude", { mode: "vertical" })
      expect(vertRes).not.toBeNull()
      expect(Object.keys(useTerminalStore.getState().tabs[0].panes).length).toBe(3)

      // 3. tab 新建标签
      const tabRes = await launchNewCliTerminal("codex", { mode: "tab" })
      expect(tabRes).not.toBeNull()
      expect(useTerminalStore.getState().tabs.length).toBe(2)

      await new Promise((resolve) => setTimeout(resolve, 80))
      expect(writeSpy).toHaveBeenCalledWith(horizRes?.paneId, "opencode\r")
      expect(writeSpy).toHaveBeenCalledWith(vertRes?.paneId, "claude\r")
      expect(writeSpy).toHaveBeenCalledWith(tabRes?.paneId, "codex\r")
    })
  })
})
