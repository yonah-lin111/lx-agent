// @vitest-environment jsdom

import type { OpenClawSessionInfo, OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { afterEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  connect: vi.fn(),
  getSnapshot: vi.fn(),
  listSessions: vi.fn(),
  createSession: vi.fn(),
  bindSession: vi.fn(),
  sendMessage: vi.fn(),
  abort: vi.fn(),
  onEvent: vi.fn(),
}))

vi.mock("@/features/openclaw/api/openclawApi", () => ({ openclawApi: api }))

import { useOpenClawChatStore } from "@/features/openclaw/openclawChatStore"

const snapshot = (sessionKey: string | null): OpenClawSessionSnapshot => ({
  instanceId: "local",
  agentId: "lily",
  sessionKey,
  connectionStatus: "connected",
  isStreaming: false,
  messages: [],
})

const sessionInfo = (key: string): OpenClawSessionInfo => ({ key })

describe("openclawChatStore session actions", () => {
  afterEach(() => {
    useOpenClawChatStore.setState({ sessions: {} })
    vi.clearAllMocks()
  })

  it("listSessions 透传主进程返回的会话列表", async () => {
    api.listSessions.mockResolvedValue([sessionInfo("agent:lily:main")])

    const sessions = await useOpenClawChatStore.getState().listSessions("local", "lily")

    expect(api.listSessions).toHaveBeenCalledWith("local", "lily")
    expect(sessions).toEqual([sessionInfo("agent:lily:main")])
  })

  it("createSession 新建后回读并写入会话投影", async () => {
    api.createSession.mockResolvedValue(sessionInfo("agent:lily:new"))
    api.getSnapshot.mockResolvedValue(snapshot("agent:lily:new"))

    await useOpenClawChatStore.getState().createSession("local", "lily")

    expect(api.createSession).toHaveBeenCalledWith("local", "lily")
    expect(api.getSnapshot).toHaveBeenCalledWith("local", "lily")
    expect(useOpenClawChatStore.getState().getSession("local", "lily")?.sessionKey).toBe(
      "agent:lily:new",
    )
  })

  it("bindSession 绑定后回读并写入会话投影", async () => {
    api.getSnapshot.mockResolvedValue(snapshot("agent:lily:ops"))

    await useOpenClawChatStore.getState().bindSession("local", "lily", "agent:lily:ops")

    expect(api.bindSession).toHaveBeenCalledWith("local", "lily", "agent:lily:ops")
    expect(useOpenClawChatStore.getState().getSession("local", "lily")?.sessionKey).toBe(
      "agent:lily:ops",
    )
  })
})
