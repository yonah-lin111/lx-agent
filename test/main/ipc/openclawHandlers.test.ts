import { OPENCLAW_CHANNELS } from "@shared/ipc/openclawChannels"
import { beforeEach, describe, expect, it, vi } from "vitest"

const handle = vi.fn()
const manager = {
  setEventSink: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  fetchAgents: vi.fn(),
  getSnapshot: vi.fn(),
  listSessions: vi.fn(),
  createSession: vi.fn(),
  bindSession: vi.fn(),
  sendMessage: vi.fn(),
  abort: vi.fn(),
}

vi.mock("electron", () => ({ ipcMain: { handle } }))
vi.mock("@/services/openclaw/openclawClientManager", () => ({
  openClawClientManager: manager,
}))

describe("openclaw IPC handlers", () => {
  beforeEach(() => {
    handle.mockClear()
    for (const method of Object.values(manager)) method.mockClear()
  })

  it("为 OpenClaw 领域 channel 注册全部主进程 handler", async () => {
    const { registerOpenClawHandlers } = await import("@/ipc/openclawHandlers")

    registerOpenClawHandlers(() => undefined)

    const expectedChannels = [
      OPENCLAW_CHANNELS.connect,
      OPENCLAW_CHANNELS.disconnect,
      OPENCLAW_CHANNELS.fetchAgents,
      OPENCLAW_CHANNELS.getSnapshot,
      OPENCLAW_CHANNELS.listSessions,
      OPENCLAW_CHANNELS.createSession,
      OPENCLAW_CHANNELS.bindSession,
      OPENCLAW_CHANNELS.sendMessage,
      OPENCLAW_CHANNELS.abort,
    ].sort()

    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(expectedChannels)
  })

  it("转发会话绑定参数到会话管理器", async () => {
    const { registerOpenClawHandlers } = await import("@/ipc/openclawHandlers")
    registerOpenClawHandlers(() => undefined)

    const bindCall = handle.mock.calls.find(
      ([channel]) => channel === OPENCLAW_CHANNELS.bindSession,
    )
    const handler = bindCall?.[1] as (
      event: unknown,
      instanceId: string,
      agentId: string,
      sessionKey: string,
    ) => void

    handler({}, "local", "lily", "agent:lily:main")

    expect(manager.bindSession).toHaveBeenCalledWith("local", "lily", "agent:lily:main")
  })

  it("拒绝空的会话绑定 key", async () => {
    const { registerOpenClawHandlers } = await import("@/ipc/openclawHandlers")
    registerOpenClawHandlers(() => undefined)

    const bindCall = handle.mock.calls.find(
      ([channel]) => channel === OPENCLAW_CHANNELS.bindSession,
    )
    const handler = bindCall?.[1] as (
      event: unknown,
      instanceId: string,
      agentId: string,
      sessionKey: string,
    ) => void

    expect(() => handler({}, "local", "lily", "  ")).toThrow("INVALID_SESSION_KEY")
  })
})
