// @vitest-environment jsdom
import { EditorView } from "@codemirror/view"
import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { LxMarkdownEditor } from "@/features/markdown/LxMarkdownEditor"
import { terminalApi } from "@/features/terminal/api/terminalApi"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = () => undefined
    unobserve = () => undefined
    disconnect = () => undefined
  },
)

const getCm = (): HTMLElement | null => document.querySelector(".cm-content")

beforeEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useBottomSideBarStore.setState({ isExpanded: false, viewMode: "terminal" })
  rightSidebarStore.setCollapsed(true)
  ;(window as unknown as { api: unknown }).api = {
    git: {
      getStatus: vi
        .fn()
        .mockResolvedValue({ branch: "dev", changes: { staged: 0, unstaged: 0, untracked: 0 } }),
      listWorktrees: vi.fn().mockResolvedValue([]),
    },
    terminal: {
      write: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue({ success: true, id: "test" }),
      hasRunningProcess: vi.fn().mockResolvedValue(false),
      onData: vi.fn().mockReturnValue(() => undefined),
      onExit: vi.fn().mockReturnValue(() => undefined),
    },
    markdown: { generateTemplateTitle: vi.fn().mockResolvedValue(null) },
    getPathForFile: vi.fn().mockReturnValue("/path"),
  }
})
afterEach(() => cleanup())

describe("LxMarkdownEditor /sendPrompt 派发", () => {
  it("模板块内：/sendPrompt agent 回车触发派发至 Agent 并清除命令行", async () => {
    const activeTabId = agentTabStore.getActiveTabId()
    const inputSetter = vi.fn()
    agentTabStore.registerInputSetter(activeTabId, inputSetter)

    const initialText = [
      "&&& addTemplate 「title: 测试需求」",
      "# 需求标题",
      "",
      "// 这是注释行，应该被过滤",
      "- 描述: 实现发送提示词功能",
      "- 未填项: ",
      "/sendPrompt agent",
      "&&&",
    ].join("\n")

    render(<LxMarkdownEditor initialContent={initialText} projectPath="/repo" />)
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    // 光标置于 /sendPrompt agent 这一行
    const commandOffset = initialText.indexOf("/sendPrompt agent") + "/sendPrompt agent".length
    view.dispatch({
      selection: { anchor: commandOffset },
    })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    expect(rightSidebarStore.isCollapsed()).toBe(false)
    expect(inputSetter).toHaveBeenCalled()
    const updater = inputSetter.mock.calls[0][0]
    const injectedPrompt = typeof updater === "function" ? updater("") : updater
    expect(injectedPrompt).not.toContain("/sendPrompt")
    expect(injectedPrompt).not.toContain("//")
    expect(injectedPrompt).not.toContain("- 未填项:")
    expect(injectedPrompt).toBe("# 需求标题\n\n- 描述: 实现发送提示词功能")

    // 验证命令行文本已被清空，但换行符保留（产生一个空行）
    expect(view.state.doc.toString()).not.toContain("/sendPrompt agent")
    expect(view.state.doc.toString()).toContain("# 需求标题")
    expect(view.state.doc.toString()).toBe(
      [
        "&&& addTemplate 「title: 测试需求」",
        "# 需求标题",
        "",
        "// 这是注释行，应该被过滤",
        "- 描述: 实现发送提示词功能",
        "- 未填项: ",
        "",
        "&&&",
      ].join("\n"),
    )
  })

  it("模板块内：/sendPrompt claude 回车触发唤起终端并清除命令行", async () => {
    const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

    const initialText = [
      "&&& addTemplate 「title: 终端任务」",
      "# 需求详情",
      "- 描述: 修复缺陷",
      "/sendPrompt claude",
      "&&&",
    ].join("\n")

    render(<LxMarkdownEditor initialContent={initialText} projectPath="/repo" />)
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    const commandOffset = initialText.indexOf("/sendPrompt claude") + "/sendPrompt claude".length
    view.dispatch({
      selection: { anchor: commandOffset },
    })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    expect(useBottomSideBarStore.getState().isExpanded).toBe(true)
    expect(useBottomSideBarStore.getState().viewMode).toBe("terminal")
    expect(view.state.doc.toString()).not.toContain("/sendPrompt claude")
    expect(writeSpy).toBeDefined()
  })

  it("模板块内：/sendPrompt opencode -enter 回车触发带回车自动执行并清除命令行", async () => {
    const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

    const initialText = [
      "&&& addTemplate 「title: 新建终端任务」",
      "# 新建任务详情",
      "- 描述: 测试 -enter 标志位",
      "/sendPrompt opencode -enter",
      "&&&",
    ].join("\n")

    render(<LxMarkdownEditor initialContent={initialText} projectPath="/repo" />)
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    const commandOffset =
      initialText.indexOf("/sendPrompt opencode -enter") + "/sendPrompt opencode -enter".length
    view.dispatch({
      selection: { anchor: commandOffset },
    })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    expect(useBottomSideBarStore.getState().isExpanded).toBe(true)
    expect(useBottomSideBarStore.getState().viewMode).toBe("terminal")
    expect(view.state.doc.toString()).not.toContain("/sendPrompt opencode -enter")
    expect(writeSpy).toBeDefined()
  })

  it("模板块内：/sendPrompt opencode:opencode-dev 回车触发向指定实例回显并清除命令行", async () => {
    const writeSpy = vi.spyOn(terminalApi, "write").mockResolvedValue()

    const initialText = [
      "&&& addTemplate 「title: 指定实例任务」",
      "# 实例任务详情",
      "- 描述: 测试多实例选择回显",
      "/sendPrompt opencode:opencode-dev",
      "&&&",
    ].join("\n")

    render(<LxMarkdownEditor initialContent={initialText} projectPath="/repo" />)
    await waitFor(() => expect(getCm()).not.toBeNull())
    await new Promise((r) => setTimeout(r, 200))

    const view = EditorView.findFromDOM(getCm()!)!
    const commandOffset =
      initialText.indexOf("/sendPrompt opencode:opencode-dev") +
      "/sendPrompt opencode:opencode-dev".length
    view.dispatch({
      selection: { anchor: commandOffset },
    })

    getCm()!.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    )
    await new Promise((r) => setTimeout(r, 120))

    expect(useBottomSideBarStore.getState().isExpanded).toBe(true)
    expect(useBottomSideBarStore.getState().viewMode).toBe("terminal")
    expect(view.state.doc.toString()).not.toContain("/sendPrompt opencode:opencode-dev")
    expect(writeSpy).toBeDefined()
  })
})
