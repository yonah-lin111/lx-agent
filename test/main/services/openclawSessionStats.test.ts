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
  responses: new Map<string, unknown>(),
  errors: new Map<string, string>(),
}))

vi.mock("@openclaw/gateway-client", () => {
  class FakeGatewayClient {
    private readonly options: FakeClientOptions
    readonly requests: FakeRequest[] = []

    constructor(options: FakeClientOptions) {
      this.options = options
      gateway.client = this
    }

    start(): void {
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

describe("openclawClientManager session stats", () => {
  beforeEach(() => {
    holder.appDataRoot = mkdtempSync(join(tmpdir(), "openclaw-stats-"))
    mkdirSync(holder.appDataRoot, { recursive: true })
    gateway.responses.clear()
    gateway.errors.clear()
    gateway.client = null
  })

  afterEach(() => {
    openClawClientManager.disposeAll()
    rmSync(holder.appDataRoot, { recursive: true, force: true })
  })

  it("getSnapshot 水合后拉取 sessions.describe 并映射模型与上下文用量", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.responses.set("sessions.describe", {
      session: {
        key: "agent:lily:main",
        model: "gemini-3.8-flash",
        modelProvider: "google",
        // 运行时模型优先于选中模型。
        activeModel: "gemini-3.8-pro",
        activeModelProvider: "google",
        contextTokens: 1048576,
        contextBudgetStatus: {
          estimatedPromptTokens: 10119,
          contextTokenBudget: 1048576,
        },
      },
    })
    await openClawClientManager.connect(instanceId)

    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")

    expect(snapshot.stats).toEqual({
      model: "gemini-3.8-pro",
      modelProvider: "google",
      contextUsed: 10119,
      contextWindow: 1048576,
    })
    const describeCall = gateway.client?.requests.find(
      (request) => request.method === "sessions.describe",
    )
    expect(describeCall?.params).toEqual({ key: "agent:lily:main", agentId: "lily" })
  })

  it("缺少 contextBudgetStatus 时回退 contextTokens，缺失字段不产生空值", async () => {
    writeConfig([
      { id: "lily", name: "Lily", sessionKey: "agent:lily:main" },
      { id: "amy", name: "Amy", sessionKey: "agent:amy:main" },
    ])
    gateway.responses.set("sessions.describe", {
      session: { key: "agent:lily:main", contextTokens: 200000 },
    })
    await openClawClientManager.connect(instanceId)

    const lily = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(lily.stats).toEqual({ contextWindow: 200000 })

    // Gateway 未提供会话详情时保持无 stats（不写空对象）。
    gateway.responses.set("sessions.describe", {})
    const amy = await openClawClientManager.getSnapshot(instanceId, "amy")
    expect(amy.stats).toBeUndefined()
  })

  it("run 结束后刷新 stats 并推送快照", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.responses.set("sessions.describe", {
      session: {
        key: "agent:lily:main",
        model: "gemini-3.8-flash",
        contextTokens: 1048576,
        contextBudgetStatus: { estimatedPromptTokens: 4096, contextTokenBudget: 1048576 },
      },
    })
    await openClawClientManager.connect(instanceId)

    const events: OpenClawSessionEvent[] = []
    openClawClientManager.setEventSink((event) => events.push(event))

    await openClawClientManager.sendMessage({ instanceId, agentId: "lily", message: "ping" })

    await vi.waitFor(() => {
      const lastSnapshot = [...events].reverse().find((event) => event.kind === "snapshot")
      expect(lastSnapshot?.kind === "snapshot" ? lastSnapshot.snapshot.stats : undefined).toEqual({
        model: "gemini-3.8-flash",
        contextUsed: 4096,
        contextWindow: 1048576,
      })
    })

    // 每轮 run 结束刷新一次。
    await openClawClientManager.sendMessage({ instanceId, agentId: "lily", message: "pong" })
    await vi.waitFor(() => {
      const describeCalls = gateway.client?.requests.filter(
        (request) => request.method === "sessions.describe",
      )
      expect(describeCalls).toHaveLength(2)
    })
    const statsSnapshots = events.filter(
      (event) => event.kind === "snapshot" && event.snapshot.stats !== undefined,
    )
    // 第一次刷新 1 次 + 第二次 run 的 user/final 快照各携带既有 stats，共 3 次。
    expect(statsSnapshots).toHaveLength(3)
  })

  it("sessions.describe 失败时保持快照可用且不影响消息", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.errors.set("sessions.describe", "insufficient scope")
    gateway.responses.set("chat.history", {
      messages: [{ id: "m1", role: "user", content: "hi", timestamp: 1 }],
    })
    await openClawClientManager.connect(instanceId)

    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")

    expect(snapshot.stats).toBeUndefined()
    expect(snapshot.messages.map((message) => message.content)).toEqual(["hi"])
  })
})
