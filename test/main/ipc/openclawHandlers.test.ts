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
      OPENCLAW_CHANNELS.sendMessage,
      OPENCLAW_CHANNELS.abort,
    ].sort()

    expect(handle.mock.calls.map(([channel]) => channel).sort()).toEqual(expectedChannels)
  })

  it("转发新建会话参数到会话管理器", async () => {
    const { registerOpenClawHandlers } = await import("@/ipc/openclawHandlers")
    registerOpenClawHandlers(() => undefined)

    const createCall = handle.mock.calls.find(
      ([channel]) => channel === OPENCLAW_CHANNELS.createSession,
    )
    const handler = createCall?.[1] as (event: unknown, instanceId: string, agentId: string) => void

    handler({}, "local", "lily")

    expect(manager.createSession).toHaveBeenCalledWith("local", "lily")
  })
})
