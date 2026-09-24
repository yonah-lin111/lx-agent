import type { ModeExitRequest } from "@shared/contracts/agent"
import { describe, expect, it, vi } from "vitest"
import { ModeExitManager } from "@/agent/mode/modeExitManager"

describe("ModeExitManager 挂起审批", () => {
  it("推送请求并在批准后 resolve(true)", async () => {
    const manager = new ModeExitManager()
    const requests: ModeExitRequest[] = []
    manager.attachSender((request) => requests.push(request))

    const pending = manager.request({
      sessionId: "s1",
      toolCallId: "tc-1",
      fromMode: "plan",
      toMode: "build",
    })

    expect(requests).toHaveLength(1)
    expect(requests[0].toolCallId).toBe("tc-1")
    expect(requests[0].fromMode).toBe("plan")
    expect(requests[0].toMode).toBe("build")
    expect(requests[0].sessionId).toBe("s1")

    expect(manager.respond(requests[0].requestId, true)).toBe(true)
    await expect(pending).resolves.toBe(true)
  })

  it("拒绝后 resolve(false)，重复响应返回 false", async () => {
    const manager = new ModeExitManager()
    const requests: ModeExitRequest[] = []
    manager.attachSender((request) => requests.push(request))

    const pending = manager.request({
      sessionId: "s1",
      toolCallId: "tc-1",
      fromMode: "review",
      toMode: "build",
    })
    expect(manager.respond(requests[0].requestId, false)).toBe(true)
    await expect(pending).resolves.toBe(false)
    expect(manager.respond(requests[0].requestId, true)).toBe(false)
  })

  it("未知 requestId 响应返回 false", () => {
    const manager = new ModeExitManager()
    expect(manager.respond("unknown", true)).toBe(false)
  })

  it("无推送目标（未接线）时按拒绝处理（fail-safe，不绕过审批）", async () => {
    const manager = new ModeExitManager()
    await expect(
      manager.request({ sessionId: null, toolCallId: "tc-1", fromMode: "plan", toMode: "build" }),
    ).resolves.toBe(false)
  })

  it("abort 挂起按拒绝解除", async () => {
    const manager = new ModeExitManager()
    const requests: ModeExitRequest[] = []
    manager.attachSender((request) => requests.push(request))
    const controller = new AbortController()

    const pending = manager.request({
      sessionId: "s1",
      toolCallId: "tc-1",
      fromMode: "design",
      toMode: "build",
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).resolves.toBe(false)
    // abort 后响应已解除的请求无效。
    expect(manager.respond(requests[0].requestId, true)).toBe(false)
  })

  it("clearSession 按会话解除挂起为拒绝，不影响其他会话", async () => {
    const manager = new ModeExitManager()
    const requests: ModeExitRequest[] = []
    manager.attachSender((request) => requests.push(request))

    const first = manager.request({
      sessionId: "s1",
      toolCallId: "tc-1",
      fromMode: "plan",
      toMode: "build",
    })
    const second = manager.request({
      sessionId: "s2",
      toolCallId: "tc-2",
      fromMode: "plan",
      toMode: "build",
    })

    manager.clearSession("s1")
    await expect(first).resolves.toBe(false)
    expect(requests).toHaveLength(2)

    manager.respond(requests[1].requestId, true)
    await expect(second).resolves.toBe(true)
  })

  it("clearSession(null) 为空操作", async () => {
    const manager = new ModeExitManager()
    const requests: ModeExitRequest[] = []
    manager.attachSender((request) => requests.push(request))
    const pending = manager.request({
      sessionId: null,
      toolCallId: "tc-1",
      fromMode: "plan",
      toMode: "build",
    })
    manager.clearSession(null)
    expect(manager.respond(requests[0].requestId, true)).toBe(true)
    await expect(pending).resolves.toBe(true)
  })

  it("已 abort 的 signal 立即按拒绝处理（不推送请求）", async () => {
    const manager = new ModeExitManager()
    const sendRequest = vi.fn()
    manager.attachSender(sendRequest)
    const controller = new AbortController()
    controller.abort()
    await expect(
      manager.request({
        sessionId: "s1",
        toolCallId: "tc-1",
        fromMode: "plan",
        toMode: "build",
        signal: controller.signal,
      }),
    ).resolves.toBe(false)
    expect(sendRequest).not.toHaveBeenCalled()
  })
})
