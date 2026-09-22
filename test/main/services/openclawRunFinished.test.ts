// @vitest-environment node
import type { EventFrame } from "@openclaw/gateway-protocol/frame-guards"
import { describe, expect, it, vi } from "vitest"
import { handleEvent } from "@/services/openclaw/openclawClientManager/eventProjection"
import type {
  AgentSession,
  InstanceConnection,
  OpenClawClientManagerHost,
} from "@/services/openclaw/openclawClientManager/types"

const createSession = (): AgentSession => ({
  agentId: "a1",
  sessionKey: "k1",
  messages: [],
  isStreaming: false,
  activeRunId: null,
  subscribed: true,
  hydrated: true,
  stats: null,
})

const createHost = (session: AgentSession) => {
  const runFinishedListener = vi.fn()
  const eventSink = vi.fn()
  const host = {
    connections: new Map(),
    eventSink,
    runFinishedListener,
    findSessionByKey: (_connection: InstanceConnection, key: string) =>
      key === session.sessionKey ? session : null,
    refreshStats: vi.fn(),
  } as unknown as OpenClawClientManagerHost
  return { host, runFinishedListener, eventSink }
}

const connection = { instanceId: "i1" } as unknown as InstanceConnection

const lifecycleFrame = (phase: "start" | "end", aborted?: boolean): EventFrame =>
  ({
    event: "agent",
    payload: {
      sessionKey: "k1",
      runId: "r1",
      stream: "lifecycle",
      data: aborted === undefined ? { phase } : { phase, aborted },
    },
  }) as unknown as EventFrame

const chatFinalFrame = (): EventFrame =>
  ({
    event: "chat",
    payload: {
      sessionKey: "k1",
      runId: "r1",
      state: "final",
      message: { id: "r1", role: "assistant", content: "done" },
    },
  }) as unknown as EventFrame

const chatErrorFrame = (errorMessage?: string): EventFrame =>
  ({
    event: "chat",
    payload: {
      sessionKey: "k1",
      runId: "r1",
      state: "error",
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    },
  }) as unknown as EventFrame

const chatAbortedFrame = (): EventFrame =>
  ({
    event: "chat",
    payload: { sessionKey: "k1", runId: "r1", state: "aborted" },
  }) as unknown as EventFrame

describe("OpenClaw run 结束回调", () => {
  it("lifecycle end 触发一次 runFinished，随后 chat final 不重复触发", () => {
    const session = createSession()
    const { host, runFinishedListener, eventSink } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("start"))
    expect(session.isStreaming).toBe(true)

    handleEvent(host, connection, lifecycleFrame("end", false))
    expect(runFinishedListener).toHaveBeenCalledTimes(1)
    expect(runFinishedListener.mock.calls[0]?.[2]).toBe(false)
    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({ kind: "snapshot" }))

    handleEvent(host, connection, chatFinalFrame())
    expect(runFinishedListener).toHaveBeenCalledTimes(1)
  })

  it("中止结束回调 aborted=true 且消息标记为 error", () => {
    const session = createSession()
    const { host, runFinishedListener } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("start"))
    handleEvent(host, connection, lifecycleFrame("end", true))

    expect(runFinishedListener).toHaveBeenCalledTimes(1)
    expect(runFinishedListener.mock.calls[0]?.[2]).toBe(true)
    expect(session.messages[0]?.status).toBe("error")
  })

  it("仅有 chat final 时也按一次 run 结束回调", () => {
    const session = createSession()
    const { host, runFinishedListener } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("start"))
    handleEvent(host, connection, chatFinalFrame())

    expect(runFinishedListener).toHaveBeenCalledTimes(1)
    expect(runFinishedListener.mock.calls[0]?.[2]).toBe(false)
    expect(session.isStreaming).toBe(false)
  })

  it("未处于流式状态时结束事件不触发回调", () => {
    const session = createSession()
    const { host, runFinishedListener } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("end", false))

    expect(runFinishedListener).not.toHaveBeenCalled()
  })

  it("chat error 事件把 run 收敛为错误并结束流式（chat.send 受理后无请求拒绝可依赖）", () => {
    const session = createSession()
    const { host, runFinishedListener } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("start"))
    handleEvent(host, connection, chatErrorFrame("provider refused"))

    const message = session.messages[0]
    expect(message?.status).toBe("error")
    expect(message?.error).toBe("provider refused")
    expect(session.isStreaming).toBe(false)
    expect(session.activeRunId).toBeNull()
    expect(runFinishedListener).toHaveBeenCalledTimes(1)
    expect(runFinishedListener.mock.calls[0]?.[2]).toBe(false)
  })

  it("chat aborted 事件按中止收敛，且随后的 lifecycle end 不覆盖错误状态", () => {
    const session = createSession()
    const { host, runFinishedListener } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("start"))
    handleEvent(host, connection, chatAbortedFrame())
    handleEvent(host, connection, lifecycleFrame("end"))

    const message = session.messages[0]
    expect(message?.status).toBe("error")
    expect(message?.error).toBe("Aborted")
    expect(session.isStreaming).toBe(false)
    expect(runFinishedListener).toHaveBeenCalledTimes(1)
    expect(runFinishedListener.mock.calls[0]?.[2]).toBe(true)
  })

  it("chat error 未携带 errorMessage 时给出兜底文案", () => {
    const session = createSession()
    const { host } = createHost(session)

    handleEvent(host, connection, lifecycleFrame("start"))
    handleEvent(host, connection, chatErrorFrame())

    expect(session.messages[0]?.error).toBe("Run failed")
  })
})
