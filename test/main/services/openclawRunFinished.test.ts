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
})
