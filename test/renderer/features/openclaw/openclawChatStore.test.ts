// @vitest-environment jsdom

import type { OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { afterEach, describe, expect, it } from "vitest"
import { useOpenClawChatStore } from "@/features/openclaw/openclawChatStore"

const snapshot = (overrides: Partial<OpenClawSessionSnapshot> = {}): OpenClawSessionSnapshot => ({
  instanceId: "local",
  agentId: "lily",
  sessionKey: "lily:lx-agent",
  connectionStatus: "connected",
  isStreaming: false,
  messages: [],
  ...overrides,
})

describe("openclawChatStore.applyEvent", () => {
  afterEach(() => {
    useOpenClawChatStore.setState({ sessions: {} })
  })

  it("snapshot 事件整条写入会话投影", () => {
    const { applyEvent, getSession } = useOpenClawChatStore.getState()

    applyEvent({ kind: "snapshot", instanceId: "local", agentId: "lily", snapshot: snapshot() })

    expect(getSession("local", "lily")?.sessionKey).toBe("lily:lx-agent")
    expect(useOpenClawChatStore.getState().getSession("local", "lily")?.connectionStatus).toBe(
      "connected",
    )
  })

  it("message-update 追加新消息", () => {
    const { applyEvent } = useOpenClawChatStore.getState()
    applyEvent({ kind: "snapshot", instanceId: "local", agentId: "lily", snapshot: snapshot() })

    applyEvent({
      kind: "message-update",
      instanceId: "local",
      agentId: "lily",
      message: { id: "run-1", role: "assistant", content: "A", timestamp: 1, status: "streaming" },
    })

    const session = useOpenClawChatStore.getState().getSession("local", "lily")
    expect(session?.messages).toHaveLength(1)
    expect(session?.messages[0]?.content).toBe("A")
  })

  it("message-update 按 id 覆盖且保持原位置", () => {
    const { applyEvent } = useOpenClawChatStore.getState()
    applyEvent({
      kind: "snapshot",
      instanceId: "local",
      agentId: "lily",
      snapshot: snapshot({
        messages: [
          { id: "run-1", role: "assistant", content: "A", timestamp: 1, status: "streaming" },
          { id: "run-2", role: "user", content: "Q", timestamp: 2, status: "completed" },
        ],
      }),
    })

    applyEvent({
      kind: "message-update",
      instanceId: "local",
      agentId: "lily",
      message: {
        id: "run-1",
        role: "assistant",
        content: "ABC",
        timestamp: 1,
        status: "streaming",
      },
    })

    const messages = useOpenClawChatStore.getState().getSession("local", "lily")?.messages ?? []
    expect(messages).toHaveLength(2)
    expect(messages[0]?.id).toBe("run-1")
    expect(messages[0]?.content).toBe("ABC")
  })

  it("未知会话的 message-update 被忽略", () => {
    const { applyEvent } = useOpenClawChatStore.getState()

    applyEvent({
      kind: "message-update",
      instanceId: "local",
      agentId: "nobody",
      message: { id: "run-1", role: "assistant", content: "A", timestamp: 1, status: "streaming" },
    })

    expect(useOpenClawChatStore.getState().sessions).toEqual({})
  })

  it("clear 移除指定会话且不影响其他会话", () => {
    const { applyEvent } = useOpenClawChatStore.getState()
    applyEvent({ kind: "snapshot", instanceId: "local", agentId: "lily", snapshot: snapshot() })
    applyEvent({
      kind: "snapshot",
      instanceId: "local",
      agentId: "amy",
      snapshot: snapshot({ agentId: "amy", sessionKey: "amy:lx-agent" }),
    })

    useOpenClawChatStore.getState().clear("local", "lily")

    expect(useOpenClawChatStore.getState().getSession("local", "lily")).toBeUndefined()
    expect(useOpenClawChatStore.getState().getSession("local", "amy")).toBeDefined()
  })
})
