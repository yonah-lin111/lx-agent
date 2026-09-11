// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

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
  writeFileSync(
    join(holder.appDataRoot, "config.json"),
    JSON.stringify({
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
    }),
  )
}

const readBoundSessionKey = (agentId: string): string | undefined => {
  const raw = JSON.parse(readFileSync(join(holder.appDataRoot, "config.json"), "utf8")) as {
    openclaw: { instances: Record<string, { agents: Array<{ id: string; sessionKey?: string }> }> }
  }
  return raw.openclaw.instances[instanceId]?.agents.find((agent) => agent.id === agentId)
    ?.sessionKey
}

describe("openclawClientManager session binding", () => {
  beforeEach(() => {
    holder.appDataRoot = mkdtempSync(join(tmpdir(), "openclaw-binding-"))
    mkdirSync(holder.appDataRoot, { recursive: true })
    gateway.responses.clear()
    gateway.errors.clear()
    gateway.client = null
  })

  afterEach(() => {
    openClawClientManager.disposeAll()
    rmSync(holder.appDataRoot, { recursive: true, force: true })
  })

  it("getSnapshot 按绑定 key 水合 chat.history 并订阅消息", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.responses.set("chat.history", {
      messages: [
        { id: "m1", role: "user", content: "hi", timestamp: 1 },
        {
          message: {
            id: "m2",
            role: "assistant",
            content: [{ type: "text", text: "hello" }],
            timestamp: 2,
          },
        },
        { role: "toolResult", content: "ignored" },
      ],
    })

    const connected = await openClawClientManager.connect(instanceId)
    expect(connected.status).toBe("connected")

    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")

    expect(snapshot.sessionKey).toBe("agent:lily:main")
    expect(snapshot.messages.map((message) => [message.role, message.content])).toEqual([
      ["user", "hi"],
      ["assistant", "hello"],
    ])
    expect(snapshot.messages.every((message) => message.status === "completed")).toBe(true)

    const historyCall = gateway.client?.requests.find(
      (request) => request.method === "chat.history",
    )
    expect(historyCall?.params).toMatchObject({ sessionKey: "agent:lily:main" })
    expect(
      gateway.client?.requests.some((request) => request.method === "sessions.messages.subscribe"),
    ).toBe(true)
  })

  it("未绑定会话的 Agent 发送时自动新建并绑定", async () => {
    writeConfig([{ id: "amy", name: "Amy" }])
    gateway.responses.set("sessions.create", { ok: true, key: "agent:amy:auto" })
    await openClawClientManager.connect(instanceId)

    await openClawClientManager.sendMessage({ instanceId, agentId: "amy", message: "ping" })

    expect(readBoundSessionKey("amy")).toBe("agent:amy:auto")
    const agentCall = gateway.client?.requests.find((request) => request.method === "agent")
    expect(agentCall?.params).toMatchObject({
      agentId: "amy",
      sessionKey: "agent:amy:auto",
      message: "ping",
    })
  })

  it("sessions.create 不可用时回退本地 key 并自动绑定", async () => {
    writeConfig([{ id: "amy", name: "Amy" }])
    gateway.errors.set("sessions.create", "insufficient scope")
    await openClawClientManager.connect(instanceId)

    await openClawClientManager.sendMessage({ instanceId, agentId: "amy", message: "ping" })

    const boundKey = readBoundSessionKey("amy")
    expect(boundKey).toMatch(/^agent:amy:lx-agent-/)
    const agentCall = gateway.client?.requests.find((request) => request.method === "agent")
    expect(agentCall?.params).toMatchObject({ agentId: "amy", sessionKey: boundKey })
  })

  it("createSession 持久化新绑定、清理投影并释放旧订阅", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    gateway.responses.set("sessions.create", { ok: true, key: "agent:lily:ops" })
    await openClawClientManager.connect(instanceId)
    await openClawClientManager.getSnapshot(instanceId, "lily")

    await openClawClientManager.createSession(instanceId, "lily")

    expect(readBoundSessionKey("lily")).toBe("agent:lily:ops")
    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(snapshot.sessionKey).toBe("agent:lily:ops")
    const unsubscribe = gateway.client?.requests.find(
      (request) => request.method === "sessions.messages.unsubscribe",
    )
    expect(unsubscribe?.params).toMatchObject({ key: "agent:lily:main" })
  })

  it("createSession 使用 Gateway 返回的 key 完成绑定", async () => {
    writeConfig([{ id: "lily", name: "Lily" }])
    gateway.responses.set("sessions.create", {
      ok: true,
      key: "agent:lily:brand-new",
      displayName: "新会话",
    })
    await openClawClientManager.connect(instanceId)

    const created = await openClawClientManager.createSession(instanceId, "lily")

    expect(created).toEqual({ key: "agent:lily:brand-new", displayName: "新会话" })
    expect(readBoundSessionKey("lily")).toBe("agent:lily:brand-new")
  })

  it("listSessions 兼容结果封套并映射会话摘要", async () => {
    writeConfig([{ id: "lily", name: "Lily" }])
    gateway.responses.set("sessions.list", {
      sessions: [
        {
          key: "agent:lily:main",
          label: "main",
          displayName: "主会话",
          updatedAt: 123,
          isMain: true,
        },
        { key: "agent:lily:ops", derivedTitle: "运维" },
        { label: "no-key" },
      ],
    })
    await openClawClientManager.connect(instanceId)

    const sessions = await openClawClientManager.listSessions(instanceId, "lily")

    expect(sessions).toEqual([
      {
        key: "agent:lily:main",
        label: "main",
        displayName: "主会话",
        updatedAt: 123,
        isMain: true,
      },
      { key: "agent:lily:ops", displayName: "运维" },
    ])
  })

  it("sendMessage 使用绑定的 sessionKey 发起 run", async () => {
    writeConfig([{ id: "lily", name: "Lily", sessionKey: "agent:lily:main" }])
    await openClawClientManager.connect(instanceId)

    await openClawClientManager.sendMessage({ instanceId, agentId: "lily", message: "ping" })

    const agentCall = gateway.client?.requests.find((request) => request.method === "agent")
    expect(agentCall?.params).toMatchObject({
      agentId: "lily",
      sessionKey: "agent:lily:main",
      message: "ping",
    })
  })
})
