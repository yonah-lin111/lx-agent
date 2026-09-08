// @vitest-environment jsdom
import type { AgentEvent, ModelSwitchMessage } from "@shared/contracts/agent"
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { useAgentChat } from "@/features/agent/hooks/useAgentChat"

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    onEvent: vi.fn(),
    abort: vi.fn(),
    send: vi.fn(),
    switchModel: vi.fn(),
    restoreSession: vi.fn().mockResolvedValue({ messages: [], todos: [] }),
  },
}))

type EventHandler = (event: AgentEvent) => void
let eventHandler: EventHandler

describe("useAgentChat switchModel", () => {
  beforeEach(() => {
    vi.mocked(agentApi.onEvent).mockImplementation((handler) => {
      eventHandler = handler
      return () => {}
    })
    vi.mocked(agentApi.switchModel).mockReset()
    vi.mocked(agentApi.restoreSession).mockResolvedValue({ messages: [], todos: [] } as any)
  })

  it("在已有会话中调用 switchModel 能够立即将 modelSwitch 消息追加到 messages", async () => {
    const mockMessage: ModelSwitchMessage = {
      role: "modelSwitch",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      family: "claude",
      instructions: "Claude instructions",
      timestamp: 1234567,
      isInitial: false,
    }

    vi.mocked(agentApi.switchModel).mockResolvedValue({
      ok: true,
      message: mockMessage,
    })

    const { result } = renderHook(() => useAgentChat(undefined, "tab-test-1", "session-existing-1"))

    // 等待初始 restoreSession 完成
    await act(async () => {})

    expect(result.current.messages).toHaveLength(0)

    let switchResult: any
    await act(async () => {
      switchResult = await result.current.switchModel({
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      })
    })

    expect(switchResult.ok).toBe(true)
    expect(result.current.messages).toHaveLength(1)
    const switchItem = result.current.messages[0]
    expect(switchItem.role).toBe("modelSwitch")
    expect(switchItem.model).toBe("claude-3-5-sonnet")
    expect(switchItem.provider).toBe("anthropic")
    expect(switchItem.instructions).toBe("Claude instructions")

    // 如果 IPC 随后广播了同样的 model_switch 事件，应该被去重，不重复追加
    act(() => {
      eventHandler({
        type: "model_switch",
        message: mockMessage,
        sessionId: "session-existing-1",
        tabId: "tab-test-1",
      })
    })

    expect(result.current.messages).toHaveLength(1)
  })

  it("在草稿态（无 sessionId）下调用 switchModel 不追加 messages", async () => {
    const { result } = renderHook(() => useAgentChat(undefined, "tab-test-2", null))

    await act(async () => {})

    await act(async () => {
      await result.current.switchModel({
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      })
    })

    expect(agentApi.switchModel).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(0)
  })
})
