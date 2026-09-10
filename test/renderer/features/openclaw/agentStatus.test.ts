import type { OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { describe, expect, it } from "vitest"
import { resolveOfficeAgentStatus } from "@/features/openclaw"

const snapshot = (patch: Partial<OpenClawSessionSnapshot>): OpenClawSessionSnapshot => ({
  instanceId: "local",
  agentId: "lily",
  sessionKey: "k",
  connectionStatus: "connected",
  isStreaming: false,
  messages: [],
  ...patch,
})

describe("resolveOfficeAgentStatus", () => {
  it("无会话快照时视为离线", () => {
    expect(resolveOfficeAgentStatus(undefined)).toBe("offline")
  })

  it("流式进行中优先判定为工作中", () => {
    expect(
      resolveOfficeAgentStatus(snapshot({ isStreaming: true, connectionStatus: "error" })),
    ).toBe("working")
  })

  it("已连接且空闲", () => {
    expect(resolveOfficeAgentStatus(snapshot({ connectionStatus: "connected" }))).toBe("idle")
  })

  it("按连接状态映射：connecting / pairing-required / error / disconnected", () => {
    expect(resolveOfficeAgentStatus(snapshot({ connectionStatus: "connecting" }))).toBe(
      "connecting",
    )
    expect(resolveOfficeAgentStatus(snapshot({ connectionStatus: "pairing-required" }))).toBe(
      "blocked",
    )
    expect(resolveOfficeAgentStatus(snapshot({ connectionStatus: "error" }))).toBe("error")
    expect(resolveOfficeAgentStatus(snapshot({ connectionStatus: "disconnected" }))).toBe("offline")
  })
})
