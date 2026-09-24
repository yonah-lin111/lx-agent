// @vitest-environment jsdom
import type { AgentEvent } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"

const toastHolder = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))

vi.mock("@/components/ui/LxToast", () => ({
  useLxAgentToast: () => toastHolder,
}))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    onEvent: vi.fn(),
    abort: vi.fn(),
    send: vi.fn(),
    restoreSession: vi.fn().mockResolvedValue({ messages: [], todos: [] }),
    setCollaborationMode: vi.fn().mockResolvedValue({ ok: true }),
    getContextUsage: vi.fn().mockResolvedValue(null),
  },
}))

type EventHandler = (event: AgentEvent) => void
let eventHandler: EventHandler

// 主进程模式事件（驱动渲染层基础模式与 auto 有效模式状态）。
const emitMode = (
  mode: "build" | "auto" | "plan" | "review" | "design" | "minimal",
  effectiveMode: typeof mode = mode,
): void => {
  eventHandler({
    type: "collaboration_mode_changed",
    mode,
    effectiveMode,
    sessionId: "session-1",
    tabId: "tab-1",
  })
}

describe("useAgentChat 协作模式切换", () => {
  beforeEach(() => {
    vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
      eventHandler = handler
      return () => {}
    })
    vi.mocked(agentApi.restoreSession).mockResolvedValue({
      messages: [],
      todos: [],
    } as unknown as Awaited<ReturnType<typeof agentApi.restoreSession>>)
    vi.mocked(agentApi.setCollaborationMode).mockClear()
    toastHolder.warning.mockClear()
  })

  it("循环切换覆盖 Minimal 并回到 Build", async () => {
    const { result } = renderHook(() => useAgentChat(undefined, "tab-1", "session-1"))
    await act(async () => {})

    act(() => emitMode("design"))
    expect(result.current.collaborationMode).toBe("design")

    act(() => result.current.toggleCollaborationMode())
    expect(agentApi.setCollaborationMode).toHaveBeenCalledWith("minimal", "session-1", "tab-1")

    act(() => emitMode("minimal"))
    act(() => result.current.toggleCollaborationMode())
    expect(agentApi.setCollaborationMode).toHaveBeenLastCalledWith("build", "session-1", "tab-1")
  })

  it("selectCollaborationMode 定向切换到指定模式", async () => {
    const { result } = renderHook(() => useAgentChat(undefined, "tab-1", "session-1"))
    await act(async () => {})

    act(() => result.current.selectCollaborationMode("minimal"))
    expect(agentApi.setCollaborationMode).toHaveBeenCalledWith("minimal", "session-1", "tab-1")
  })

  it("mode_exit_request 触发 warning toast（确认块在消息流中，避免用户漏看导致回合挂起）", async () => {
    renderHook(() => useAgentChat(undefined, "tab-1", "session-1"))
    await act(async () => {})

    act(() => {
      eventHandler({
        type: "mode_exit_request",
        sessionId: "session-1",
        tabId: "tab-1",
        request: {
          requestId: "session-1:1",
          toolCallId: "call-1",
          fromMode: "plan",
          toMode: "build",
          sessionId: "session-1",
        },
      })
    })

    expect(toastHolder.warning).toHaveBeenCalledTimes(1)
  })
})
