// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { OpenClawSessionEvent } from "@shared/contracts/openclaw"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { writeConfigTree } from "../../helpers/configLayout"

interface FakeClientOptions {
  onHelloOk?: () => void
  onConnectError?: (error: Error) => void
  onEvent?: (event: unknown) => void
  onClose?: (code: number, reason: string) => void
}

interface FakeRequest {
  method: string
  params: unknown
}

const gateway = vi.hoisted(() => ({
  client: null as { requests: FakeRequest[] } | null,
  options: null as FakeClientOptions | null,
  responses: new Map<string, unknown>(),
  errors: new Map<string, string>(),
  connectError: null as string | null,
  instances: 0,
}))

vi.mock("@openclaw/gateway-client", () => {
  class FakeGatewayClient {
    private readonly options: FakeClientOptions
    readonly requests: FakeRequest[] = []

    constructor(options: FakeClientOptions) {
      this.options = options
      gateway.client = this
      gateway.options = options
      gateway.instances += 1
    }

    start(): void {
      if (gateway.connectError) {
        this.options.onConnectError?.(new Error(gateway.connectError))
        return
      }
      this.options.onHelloOk?.()
    }

    stop(): void {}

    request(method: string, params: unknown): Promise<unknown> {
      this.requests.push({ method, params })
      const error = gateway.errors.get(method)
      if (error) return Promise.reject(new Error(error))
      return Promise.resolve(gateway.responses.get(method))
    }
  }
  return { GatewayClient: FakeGatewayClient }
})

const holder = vi.hoisted(() => ({ appDataRoot: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getAppDataRoot: () => holder.appDataRoot,
    getConfigPath: () => join(holder.appDataRoot, "config.json"),
  }
})

import { openClawClientManager } from "@/services/openclaw/openclawClientManager"

const instanceId = "local"
const gatewayUrl = "ws://127.0.0.1:18789"

const writeConfig = (agents: Array<{ id: string; name: string; sessionKey?: string }>): void => {
  writeConfigTree(join(holder.appDataRoot, "config.json"), {
    openclaw: {
      instances: {
        [instanceId]: {
          name: "Local",
          gatewayUrl,
          authMode: "token",
          token: "test-token",
          enabled: true,
          agents,
        },
      },
    },
  })
}

const subscribeCalls = (): FakeRequest[] =>
  (gateway.client?.requests ?? []).filter(
    (request) => request.method === "sessions.messages.subscribe",
  )

describe("openclawClientManager 重连调度与事件投影", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    holder.appDataRoot = mkdtempSync(join(tmpdir(), "openclaw-lifecycle-"))
    mkdirSync(holder.appDataRoot, { recursive: true })
    gateway.responses.clear()
    gateway.errors.clear()
    gateway.client = null
    gateway.options = null
    gateway.connectError = null
    gateway.instances = 0
  })

  afterEach(() => {
    openClawClientManager.disposeAll()
    vi.restoreAllMocks()
    vi.useRealTimers()
    rmSync(holder.appDataRoot, { recursive: true, force: true })
  })

  it("连接失败后按 1s、2s 指数退避重连", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.connectError = "connect ECONNREFUSED 127.0.0.1:18789"

    const failed = await openClawClientManager.connect(instanceId)
    expect(failed.status).toBe("error")
    expect(failed.error).toContain("ECONNREFUSED")
    expect(gateway.instances).toBe(1)

    // 首次重试延迟 1s。
    await vi.advanceTimersByTimeAsync(1000)
    expect(gateway.instances).toBe(2)

    // 第二次重试延迟 2s：1s 后不应重试。
    await vi.advanceTimersByTimeAsync(1000)
    expect(gateway.instances).toBe(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(gateway.instances).toBe(3)
  })

  it("重连成功后可恢复连接，并在握手时重置会话水合与订阅标记", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.responses.set("chat.history", {
      messages: [{ id: "m1", role: "user", content: "hi", timestamp: 1 }],
    })
    gateway.connectError = "ECONNREFUSED 127.0.0.1:18789"
    await openClawClientManager.connect(instanceId)

    gateway.connectError = null
    await vi.advanceTimersByTimeAsync(1000)
    expect(gateway.instances).toBe(2)

    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(snapshot.connectionStatus).toBe("connected")
    expect(snapshot.messages.map((message) => message.content)).toEqual(["hi"])
    // 重连后重新水合 -> 重新建立订阅。
    expect(subscribeCalls()).toHaveLength(1)
  })

  it("disconnect 清理重连定时器，不再自动重连", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.connectError = "ECONNREFUSED 127.0.0.1:18789"
    await openClawClientManager.connect(instanceId)
    expect(gateway.instances).toBe(1)

    await openClawClientManager.disconnect(instanceId)
    await vi.advanceTimersByTimeAsync(40_000)

    expect(gateway.instances).toBe(1)
  })

  it("ensureSubscribed 对同一会话只订阅一次，重连后重新订阅", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.responses.set("chat.history", {
      messages: [{ id: "m1", role: "user", content: "hi", timestamp: 1 }],
    })
    await openClawClientManager.connect(instanceId)

    await openClawClientManager.getSnapshot(instanceId, "lily")
    await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(subscribeCalls()).toHaveLength(1)

    // 模拟连接非预期中断 -> 退避重连 -> 重新订阅。
    gateway.options?.onClose?.(1006, "restart")
    await vi.advanceTimersByTimeAsync(1000)
    expect(gateway.instances).toBe(2)

    await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(subscribeCalls()).toHaveLength(1)
  })

  it("审批请求事件落到对应会话并推送快照，未知会话忽略", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    await openClawClientManager.connect(instanceId)
    await openClawClientManager.getSnapshot(instanceId, "lily")

    const events: OpenClawSessionEvent[] = []
    openClawClientManager.setEventSink((event) => events.push(event))

    gateway.options?.onEvent?.({
      event: "exec.approval.requested",
      payload: { sessionKey: "agent:lily:main", requestId: "req-9" },
    })

    const snapshot = [...events].reverse().find((event) => event.kind === "snapshot")
    expect(snapshot?.kind).toBe("snapshot")
    const messages = snapshot?.kind === "snapshot" ? snapshot.snapshot.messages : []
    expect(messages).toEqual([
      expect.objectContaining({
        id: "approval-req-9",
        role: "system",
        content: "req-9",
        code: "approval-required",
      }),
    ])

    const eventCount = events.length
    gateway.options?.onEvent?.({
      event: "exec.approval.requested",
      payload: { sessionKey: "agent:unknown:main", requestId: "req-10" },
    })
    expect(events).toHaveLength(eventCount)
  })
})
