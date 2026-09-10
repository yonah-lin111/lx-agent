// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { getMatchedCommands } from "@/features/agent/components/AgentInput/AgentMarkdownInput/agentMarkdownInputUtils"
import { useAgentInputActions } from "@/features/agent/components/AgentInput/AgentMarkdownInput/hooks/useAgentInputActions"
import { projectApi } from "@/features/project/api/projectApi"

vi.mock("@/features/project/api/projectApi", () => ({
  projectApi: {
    findOrCreateByPath: vi.fn(),
    selectDirectory: vi.fn(),
  },
}))

describe("/cd 命令测试", () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const mockT = (key: string) => key

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

  describe("自动补全与模板填充", () => {
    it("/cd 命令在自动补全列表中并匹配 /cd", () => {
      const cmds = getMatchedCommands("/cd", [], mockT)
      expect(cmds.some((c) => c.id === "cd")).toBe(true)
    })

    it("executeCommand 正确填充 /cd [path]", () => {
      const onChange = vi.fn()
      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          onChangeRef: { current: onChange },
        }),
      )

      result.current.executeCommand({
        id: "cd",
        name: "cd",
        description: "Change directory workspace",
      })
      expect(onChange).toHaveBeenCalledWith("/cd [path]")
    })
  })

  describe("执行 /cd 命令拦截与处理", () => {
    it("带路径执行 /cd: 调用 findOrCreateByPath 并触发 onCdSelect", async () => {
      const onCdSelect = vi.fn()
      const onChange = vi.fn()
      vi.mocked(projectApi.findOrCreateByPath).mockResolvedValue({
        id: "p-new",
        name: "my-repo",
        path: "/custom/workspace/my-repo",
        type: "folder",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
        isImported: false,
      })

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          valueRef: { current: "/cd /custom/workspace/my-repo" },
          onChangeRef: { current: onChange },
          onCdSelect,
        }),
      )

      result.current.handleSendAction()

      expect(onChange).toHaveBeenCalledWith("")
      expect(projectApi.findOrCreateByPath).toHaveBeenCalledWith("/custom/workspace/my-repo")

      await vi.waitFor(() => {
        expect(onCdSelect).toHaveBeenCalledWith("p-new", "/custom/workspace/my-repo")
      })
    })

    it("无参数执行 /cd: 打开目录选择器并在选择后调用 findOrCreateByPath", async () => {
      const onCdSelect = vi.fn()
      const onChange = vi.fn()
      vi.mocked(projectApi.selectDirectory).mockResolvedValue("/picked/directory")
      vi.mocked(projectApi.findOrCreateByPath).mockResolvedValue({
        id: "p-picked",
        name: "directory",
        path: "/picked/directory",
        type: "folder",
        referencedFolders: [],
        createdAt: "",
        updatedAt: "",
        isImported: false,
      })

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          valueRef: { current: "/cd" },
          onChangeRef: { current: onChange },
          onCdSelect,
        }),
      )

      result.current.handleSendAction()

      expect(onChange).toHaveBeenCalledWith("")
      expect(projectApi.selectDirectory).toHaveBeenCalled()

      await vi.waitFor(() => {
        expect(projectApi.findOrCreateByPath).toHaveBeenCalledWith("/picked/directory")
        expect(onCdSelect).toHaveBeenCalledWith("p-picked", "/picked/directory")
      })
    })

    it("路径不存在时调用 errorToast 提示路径不存在", async () => {
      const onCdSelect = vi.fn()
      const errorToast = vi.fn()
      vi.mocked(projectApi.findOrCreateByPath).mockRejectedValue(
        new Error("PROJECT_PATH_NOT_FOUND"),
      )

      const { result } = renderHook(() =>
        useAgentInputActions({
          ...defaultProps,
          valueRef: { current: "/cd /invalid/path" },
          errorToast,
          onCdSelect,
        }),
      )

      result.current.handleSendAction()

      await vi.waitFor(() => {
        expect(errorToast).toHaveBeenCalledWith("agent.pathNotFound")
        expect(onCdSelect).not.toHaveBeenCalled()
      })
    })
  })
})
