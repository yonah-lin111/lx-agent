// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
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

    emit(event: unknown): void {
      this.options.onEvent?.(event)
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
const sessionKey = "agent:lily:main"

const writeConfig = (): void => {
  writeConfigTree(join(holder.appDataRoot, "config.json"), {
    openclaw: {
      instances: {
        [instanceId]: {
          name: "Local",
          gatewayUrl,
          authMode: "token",
          token: "test-token",
          enabled: true,
          agents: [{ id: "lily", name: "Lily", sessionKey }],
        },
      },
    },
  })
}

const emitEvent = (event: unknown): void => {
  ;(gateway.client as unknown as { emit: (event: unknown) => void }).emit(event)
}

describe("openclawClientManager per-message usage", () => {
  beforeEach(() => {
    holder.appDataRoot = mkdtempSync(join(tmpdir(), "openclaw-usage-"))
    mkdirSync(holder.appDataRoot, { recursive: true })
    gateway.responses.clear()
    gateway.errors.clear()
    gateway.client = null
  })

  afterEach(() => {
    openClawClientManager.disposeAll()
    rmSync(holder.appDataRoot, { recursive: true, force: true })
  })

  it("chat.history 水合保留每条 assistant 消息的模型与 token 用量", async () => {
    writeConfig()
    gateway.responses.set("chat.history", {
      messages: [
        { id: "m1", role: "user", content: "hi", timestamp: 1 },
        {
          message: {
            id: "m2",
            role: "assistant",
            content: [{ type: "text", text: "hello" }],
            timestamp: 2,
            model: "gemini-3.8-flash",
            provider: "google",
            usage: { input: 100, output: 20, totalTokens: 120 },
          },
        },
      ],
    })
    await openClawClientManager.connect(instanceId)

    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")

    expect(snapshot.messages[0]?.model).toBeUndefined()
    expect(snapshot.messages[1]).toMatchObject({
      content: "hello",
      model: "gemini-3.8-flash",
      modelProvider: "google",
      usage: { input: 100, output: 20 },
    })
  })

  it("run 结束的 final 事件把模型与 token 用量回填到该条消息", async () => {
    writeConfig()
    gateway.responses.set("chat.history", { messages: [] })
    await openClawClientManager.connect(instanceId)
    await openClawClientManager.sendMessage({ instanceId, agentId: "lily", message: "ping" })
    // 完成一次水合，避免 getSnapshot 覆盖事件驱动的消息。
    await openClawClientManager.getSnapshot(instanceId, "lily")

    emitEvent({
      event: "agent",
      payload: {
        sessionKey,
        runId: "run-1",
        stream: "lifecycle",
        data: { phase: "start" },
      },
    })
    emitEvent({
      event: "chat",
      payload: {
        sessionKey,
        runId: "run-1",
        state: "final",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "pong" }],
          model: "gemini-3.8-pro",
          provider: "google",
        },
        usage: { input: 1234, output: 56, totalTokens: 1290 },
      },
    })

    const snapshot = await openClawClientManager.getSnapshot(instanceId, "lily")
    const assistant = snapshot.messages.find((message) => message.role === "assistant")

    expect(assistant).toMatchObject({
      content: "pong",
      status: "completed",
      model: "gemini-3.8-pro",
      modelProvider: "google",
      usage: { input: 1234, output: 56 },
    })
  })
})
