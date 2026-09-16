// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
  client: null as { emit: (event: unknown) => void } | null,
  requests: [] as FakeRequest[],
  responses: new Map<string, unknown>(),
  errors: new Map<string, string>(),
  // chat.history 的当前云端状态（解析与删除后水合共用）。
  historyMessages: [] as unknown[],
  // 删除成功后的云端历史（未设置时保持 historyMessages 原值）。
  postRewindHistory: null as unknown[] | null,
  // sessions.rewind 前 N 次调用注入失败（模拟直传 id 不是云端 entryId）。
  rewindErrors: 0,
}))

vi.mock("@openclaw/gateway-client", () => {
  class FakeGatewayClient {
    private readonly options: FakeClientOptions

    constructor(options: FakeClientOptions) {
      this.options = options
      gateway.client = this
    }

    start(): void {
      this.options.onHelloOk?.()
    }

    stop(): void {}

    request(method: string, params: unknown): Promise<unknown> {
      gateway.requests.push({ method, params })
      if (method === "sessions.rewind" && gateway.rewindErrors > 0) {
        gateway.rewindErrors -= 1
        return Promise.reject(
          new Error(`unknown entryId: ${(params as { entryId: string }).entryId}`),
        )
      }
      if (method === "sessions.rewind" && gateway.postRewindHistory) {
        gateway.historyMessages = gateway.postRewindHistory
      }
      const error = gateway.errors.get(method)
      if (error) return Promise.reject(new Error(error))
      if (method === "chat.history") {
        return Promise.resolve({ messages: gateway.historyMessages })
      }
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
            agents: [{ id: "lily", name: "Lily", sessionKey }],
          },
        },
      },
    }),
  )
}

const emitEvent = (event: unknown): void => {
  gateway.client?.emit(event)
}

const rewindCalls = (): FakeRequest[] =>
  gateway.requests.filter((request) => request.method === "sessions.rewind")

describe("openclawClientManager 轮次删除（sessions.rewind）", () => {
  beforeEach(() => {
    holder.appDataRoot = mkdtempSync(join(tmpdir(), "openclaw-delete-turn-"))
    mkdirSync(holder.appDataRoot, { recursive: true })
    gateway.requests = []
    gateway.responses.clear()
    gateway.errors.clear()
    gateway.historyMessages = []
    gateway.postRewindHistory = null
    gateway.rewindErrors = 0
    gateway.client = null
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    openClawClientManager.disposeAll()
    vi.restoreAllMocks()
    rmSync(holder.appDataRoot, { recursive: true, force: true })
  })

  it("已水合会话：直传轮次用户消息 entryId，删除后投影按云端历史收敛为空", async () => {
    writeConfig()
    gateway.historyMessages = [
      { id: "u1", role: "user", content: "hello", timestamp: 1 },
      { id: "a1", role: "assistant", content: "reply", timestamp: 2, runId: "run-1" },
    ]
    gateway.postRewindHistory = []
    await openClawClientManager.connect(instanceId)
    const before = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(before.messages.map((message) => message.id)).toEqual(["u1", "a1"])

    await openClawClientManager.deleteTurn(instanceId, "lily", "a1")

    expect(rewindCalls()).toHaveLength(1)
    expect(rewindCalls()[0]?.params).toEqual({ sessionKey, entryId: "u1" })
    const after = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(after.messages).toEqual([])
  })

  it("本次运行新产出的消息：本地乐观 id 直传失败后按 runId 解析轮次 entryId 重试", async () => {
    writeConfig()
    gateway.historyMessages = []
    await openClawClientManager.connect(instanceId)
    // 先完成水合，避免后续 getSnapshot 覆盖事件驱动的本地乐观投影。
    await openClawClientManager.getSnapshot(instanceId, "lily")
    await openClawClientManager.sendMessage({ instanceId, agentId: "lily", message: "hello" })

    emitEvent({
      event: "agent",
      payload: { sessionKey, runId: "run-9", stream: "lifecycle", data: { phase: "start" } },
    })
    emitEvent({
      event: "chat",
      payload: {
        sessionKey,
        runId: "run-9",
        state: "final",
        message: { role: "assistant", content: [{ type: "text", text: "reply" }] },
      },
    })

    const before = await openClawClientManager.getSnapshot(instanceId, "lily")
    const optimisticUser = before.messages.find((message) => message.role === "user")
    const assistant = before.messages.find((message) => message.role === "assistant")
    expect(optimisticUser).toBeDefined()
    expect(assistant?.id).toBe("run-9")

    // 云端历史（权威 id）与本地乐观投影并存：直传本地 id 必然失败。
    gateway.historyMessages = [
      { id: "hist-u1", role: "user", content: "hello", timestamp: optimisticUser?.timestamp },
      { id: "hist-a1", role: "assistant", content: "reply", timestamp: 3, runId: "run-9" },
    ]
    gateway.postRewindHistory = []
    gateway.rewindErrors = 1

    await openClawClientManager.deleteTurn(instanceId, "lily", "run-9")

    expect(rewindCalls()).toHaveLength(2)
    expect((rewindCalls()[0]?.params as { entryId: string }).entryId).toBe(optimisticUser?.id)
    expect((rewindCalls()[1]?.params as { entryId: string }).entryId).toBe("hist-u1")
    const after = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(after.messages).toEqual([])
  })

  it("解析结果与直传 id 相同（云端无此 entry）时保留原始错误，不改动投影", async () => {
    writeConfig()
    gateway.historyMessages = [
      { id: "u1", role: "user", content: "hello", timestamp: 1 },
      { id: "a1", role: "assistant", content: "reply", timestamp: 2, runId: "run-1" },
    ]
    await openClawClientManager.connect(instanceId)
    await openClawClientManager.getSnapshot(instanceId, "lily")
    gateway.rewindErrors = 1

    await expect(openClawClientManager.deleteTurn(instanceId, "lily", "a1")).rejects.toThrow(
      "unknown entryId: u1",
    )

    expect(rewindCalls()).toHaveLength(1)
    const after = await openClawClientManager.getSnapshot(instanceId, "lily")
    expect(after.messages.map((message) => message.id)).toEqual(["u1", "a1"])
  })

  it("会话流式中拒绝删除：不发送 rewind 请求", async () => {
    writeConfig()
    gateway.historyMessages = [
      { id: "u1", role: "user", content: "hello", timestamp: 1 },
      { id: "a1", role: "assistant", content: "reply", timestamp: 2, runId: "run-1" },
    ]
    await openClawClientManager.connect(instanceId)
    await openClawClientManager.getSnapshot(instanceId, "lily")
    emitEvent({
      event: "agent",
      payload: { sessionKey, runId: "run-2", stream: "lifecycle", data: { phase: "start" } },
    })

    await expect(openClawClientManager.deleteTurn(instanceId, "lily", "a1")).rejects.toThrow(
      "This agent is already running a task",
    )
    expect(rewindCalls()).toHaveLength(0)
  })

  it("目标消息不属于该会话时拒绝删除", async () => {
    writeConfig()
    gateway.historyMessages = []
    await openClawClientManager.connect(instanceId)
    await openClawClientManager.getSnapshot(instanceId, "lily")

    await expect(openClawClientManager.deleteTurn(instanceId, "lily", "missing")).rejects.toThrow(
      "Message not found in session",
    )
    expect(rewindCalls()).toHaveLength(0)
  })
})
