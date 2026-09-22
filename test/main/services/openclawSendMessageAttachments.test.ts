// @vitest-environment node

import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import {
  getOrCreateSession,
  sendMessage,
} from "@/services/openclaw/openclawClientManager/sessionRuntime"
import type {
  InstanceConnection,
  OpenClawClientManagerHost,
} from "@/services/openclaw/openclawClientManager/types"

const workspace = mkdtempSync(join(tmpdir(), "openclaw-send-"))
const pngPath = join(workspace, "photo.png")
writeFileSync(pngPath, Buffer.from("png-payload"))
const pdfPath = join(workspace, "doc.pdf")
writeFileSync(pdfPath, Buffer.from("pdf-payload"))

interface RecordedRequest {
  method: string
  params: Record<string, unknown>
}

// 假 GatewayClient：记录 RPC，按方法返回受理结果。
const createHarness = () => {
  const requests: RecordedRequest[] = []
  const client = {
    request: vi.fn(async (method: string, params: Record<string, unknown>) => {
      requests.push({ method, params })
      if (method === "sessions.messages.subscribe") return {}
      return { runId: "run-1", status: "accepted" }
    }),
  }
  const connection = {
    instanceId: "i1",
    config: {
      name: "local",
      gatewayUrl: "ws://127.0.0.1:1",
      authMode: "token",
      enabled: true,
      agents: [{ id: "a1", name: "A1", workspace, isDefault: true, sessionKey: "session-a1" }],
    },
    client,
    status: "connected",
    sessions: new Map(),
  } as unknown as InstanceConnection

  const host = {
    connections: new Map([["i1", connection]]),
    eventSink: vi.fn(),
    runFinishedListener: null,
    emitSnapshot: vi.fn(),
    toSnapshot: vi.fn(),
    handleEvent: vi.fn(),
    connect: vi.fn(async () => ({ status: "connected" })),
    getOrCreateConnection: vi.fn(),
    refreshConnectionConfig: vi.fn(),
    findSessionByKey: vi.fn(),
    refreshStats: vi.fn(async () => {}),
  } as unknown as OpenClawClientManagerHost

  const session = getOrCreateSession(connection, "a1")
  return { host, connection, session, requests }
}

describe("OpenClaw 发送通道选择", () => {
  it("无附件走 agent，且不带 attachments 参数", async () => {
    const { host, session, requests } = createHarness()
    await sendMessage(host, { instanceId: "i1", agentId: "a1", message: "hello" })

    const run = requests.find((item) => item.method === "agent")
    expect(run).toBeTruthy()
    expect(run?.params.attachments).toBeUndefined()
    expect(session.messages[0]?.files).toBeUndefined()
  })

  it("图片附件走 chat.send 并携带 image 类型附件", async () => {
    const { host, session, requests } = createHarness()
    await sendMessage(host, {
      instanceId: "i1",
      agentId: "a1",
      message: "look",
      files: [{ name: "photo.png", path: pngPath, type: "image", sizeBytes: 11 }],
    })

    expect(requests.some((item) => item.method === "agent")).toBe(false)
    const run = requests.find((item) => item.method === "chat.send")
    expect(run?.params.sessionKey).toBe("session-a1")
    expect(run?.params.attachments).toEqual([
      {
        type: "image",
        mimeType: "image/png",
        fileName: "photo.png",
        content: Buffer.from("png-payload").toString("base64"),
        sizeBytes: 11,
      },
    ])
    expect(session.messages[0]?.files).toEqual([
      { name: "photo.png", path: pngPath, type: "image", sizeBytes: 11 },
    ])
  })

  it("非图片文件同样走 chat.send，MIME 交由网关嗅探", async () => {
    const { host, requests } = createHarness()
    await sendMessage(host, {
      instanceId: "i1",
      agentId: "a1",
      message: "read this",
      files: [{ name: "doc.pdf", path: pdfPath, type: "text" }],
    })

    const run = requests.find((item) => item.method === "chat.send")
    expect(run?.params.attachments).toEqual([
      {
        type: "file",
        mimeType: "application/octet-stream",
        fileName: "doc.pdf",
        content: Buffer.from("pdf-payload").toString("base64"),
        sizeBytes: 11,
      },
    ])
  })

  it("附件不可读时拒绝发送且不写入乐观消息", async () => {
    const { host, session, requests } = createHarness()
    await expect(
      sendMessage(host, {
        instanceId: "i1",
        agentId: "a1",
        message: "oops",
        files: [{ name: "missing.png", path: join(workspace, "missing.png"), type: "image" }],
      }),
    ).rejects.toThrow(/OPENCLAW_ATTACHMENT_MISSING/)

    expect(requests.some((item) => item.method === "chat.send")).toBe(false)
    expect(session.messages).toHaveLength(0)
    expect(session.isStreaming).toBe(false)
  })
})
