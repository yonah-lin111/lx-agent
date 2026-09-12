// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AgentInputProjectPanel,
  AgentInputSessionPanel,
} from "@/features/agent/components/AgentInput/AgentInputCommandPanels"
import { getMatchedCommands } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { useAgentInputActions } from "@/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputActions"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"

describe("/project 和 /session 命令测试", () => {
  afterEach(cleanup)

  const mockT = (key: string) => key

  describe("命令自动补全与拦截", () => {
    it("allowProjectChange 为 true 时包含 /project 命令", () => {
      const cmds = getMatchedCommands("/pro", [], mockT, true)
      expect(cmds.some((c) => c.id === "project")).toBe(true)
    })

    it("allowProjectChange 为 false 时排除 /project 命令", () => {
      const cmds = getMatchedCommands("/pro", [], mockT, false)
      expect(cmds.some((c) => c.id === "project")).toBe(false)
    })

    it("/session 命令始终在自动补全列表中", () => {
      const cmds = getMatchedCommands("/sess", [], mockT)
      expect(cmds.some((c) => c.id === "session")).toBe(true)
    })

    it("输入 /resume 或 /res 也可以匹配 /session 命令", () => {
      const cmds = getMatchedCommands("/res", [], mockT)
      expect(cmds.some((c) => c.id === "session")).toBe(true)

      const fullCmds = getMatchedCommands("/resume", [], mockT)
      expect(fullCmds.some((c) => c.id === "session")).toBe(true)
    })
  })

  describe("AgentInputProjectPanel 视图测试", () => {
    it("正确渲染项目列表及位于名称右侧的 current tag", () => {
      const projects = [
        { id: "p1", name: "Project One", path: "/path/one", isCurrent: true },
        { id: "p2", name: "Project Two", path: "/path/two", isCurrent: false },
      ]

      render(
        <AgentInputProjectPanel
          isOpen={true}
          position={{ top: 0, left: 0 }}
          projects={projects}
          activeIndex={0}
        />,
      )

      const nameEl = screen.getByText("Project One")
      const currentEl = screen.getByText("current")
      expect(nameEl).toBeDefined()
      expect(screen.getByText("Project Two")).toBeDefined()
      expect(currentEl).toBeDefined()

      // 验证 current 标签在项目名之后
      expect(
        nameEl.compareDocumentPosition(currentEl) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  describe("AgentInputSessionPanel 视图测试", () => {
    it("正确渲染会话列表及位于标题右侧的 current tag", () => {
      const sessions = [
        {
          id: "s1",
          title: "Session 1",
          cwd: "/path/one",
          updatedAt: new Date().toISOString(),
          isCurrent: true,
        },
        {
          id: "s2",
          title: "Session 2",
          cwd: "/path/one",
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          isCurrent: false,
        },
      ]

      render(
        <AgentInputSessionPanel
          isOpen={true}
          position={{ top: 0, left: 0 }}
          sessions={sessions}
          activeIndex={0}
        />,
      )

      const titleEl = screen.getByText("Session 1")
      const currentEl = screen.getByText("current")
      expect(titleEl).toBeDefined()
      expect(screen.getByText("Session 2")).toBeDefined()
      expect(currentEl).toBeDefined()

      // 验证 current 标签在会话标题之后
      expect(
        titleEl.compareDocumentPosition(currentEl) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })
  })

  describe("useAgentInputActions 处理", () => {
    const defaultProps = {
      editorViewRef: {
        current: {
          state: { doc: { length: 0 } },
          dispatch: vi.fn(),
          focus: vi.fn(),
        } as any,
      },
      valueRef: { current: "" },
      onChangeRef: { current: vi.fn() },
      onSendRef: { current: vi.fn() },
      setActiveMode: vi.fn(),
      setUndoConfirmIndex: vi.fn(),
      updatePanelPosition: vi.fn(),
      setBlockCommands: vi.fn(),
      setBlockCommandPosition: vi.fn(),
      record: vi.fn(),
      reset: vi.fn(),
      successToast: vi.fn(),
      errorToast: vi.fn(),
      warningToast: vi.fn(),
      t: mockT,
    }

    it("非新会话 (allowProjectChange=false) 时手动发送 /project 会被拦截并提示", () => {
      const warningToast = vi.fn()
      const onChange = vi.fn()
      const onSend = vi.fn()

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          valueRef: { current: "/project" },
          onChangeRef: { current: onChange },
          onSendRef: { current: onSend },
          warningToast,
          allowProjectChange: false,
        }),
      )

      result.current.handleSendAction()
      expect(warningToast).toHaveBeenCalledWith("agent.projectChangeOnlyInNewChat")
      expect(onChange).toHaveBeenCalledWith("")
      expect(onSend).not.toHaveBeenCalled()
    })

    it("executeCommand 正确处理 project 与 session", () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          onChangeRef: { current: onChange },
        }),
      )

      result.current.executeCommand({
        id: "project",
        name: "project",
        description: "Switch project",
      })
      expect(onChange).toHaveBeenCalledWith("/project ")

      result.current.executeCommand({
        id: "session",
        name: "session",
        description: "Switch session",
      })
      expect(onChange).toHaveBeenCalledWith("/session ")
    })

    it("selectProject 触发 onProjectSelect 并清空输入", () => {
      const onProjectSelect = vi.fn()
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          onChangeRef: { current: onChange },
          onProjectSelect,
        }),
      )

      result.current.selectProject({
        id: "p1",
        name: "Project 1",
        path: "/path/to/project",
      })

      expect(onProjectSelect).toHaveBeenCalledWith("p1", "/path/to/project")
      expect(onChange).toHaveBeenCalledWith("")
    })

    it("selectSession: 如果已在当前会话则为 no-op", () => {
      const onSessionSelect = vi.fn()
      const switchTabSpy = vi.spyOn(agentTabStore, "switchTab")

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          currentSessionId: "s1",
          onSessionSelect,
        }),
      )

      result.current.selectSession({
        id: "s1",
        title: "Session 1",
        cwd: "/path",
        updatedAt: "",
      })

      expect(onSessionSelect).not.toHaveBeenCalled()
      expect(switchTabSpy).not.toHaveBeenCalled()
    })

    it("selectSession: 如果在其他 tab 打开则切换到该 tab", () => {
      const onSessionSelect = vi.fn()
      vi.spyOn(agentTabStore, "findTabBySessionId").mockReturnValue({
        id: "tab-2",
        sessionId: "s2",
        createdAt: 100,
      })
      const switchTabSpy = vi.spyOn(agentTabStore, "switchTab").mockImplementation(() => {})

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          currentSessionId: "s1",
          onSessionSelect,
        }),
      )

      result.current.selectSession({
        id: "s2",
        title: "Session 2",
        cwd: "/path",
        updatedAt: "",
      })

      expect(switchTabSpy).toHaveBeenCalledWith("tab-2")
      expect(onSessionSelect).not.toHaveBeenCalled()
    })

    it("selectSession: 如果未在任何 tab 打开则调用 onSessionSelect", () => {
      const onSessionSelect = vi.fn()
      vi.spyOn(agentTabStore, "findTabBySessionId").mockReturnValue(undefined)

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          currentSessionId: "s1",
          onSessionSelect,
        }),
      )

      result.current.selectSession({
        id: "s3",
        title: "Session 3",
        cwd: "/path",
        updatedAt: "",
      })

      expect(onSessionSelect).toHaveBeenCalledWith("s3")
    })
  })
})
