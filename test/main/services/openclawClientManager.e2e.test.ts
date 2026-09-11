// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { OpenClawSessionEvent, OpenClawSessionSnapshot } from "@shared/contracts/openclaw"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

// 端到端测试需要一个真实的本地 OpenClaw Gateway：
//   OPENCLAW_E2E_GATEWAY_URL=ws://127.0.0.1:18789 \
//   OPENCLAW_E2E_TOKEN=<gateway token> \
//   pnpm exec vitest run test/main/services/openclawClientManager.e2e.test.ts
const gatewayUrl = process.env.OPENCLAW_E2E_GATEWAY_URL
const gatewayToken = process.env.OPENCLAW_E2E_TOKEN
const runE2E = Boolean(gatewayUrl && gatewayToken)

const holder = vi.hoisted(() => ({ appDataRoot: "" }))

vi.mock("@/paths", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/paths")>()
  return {
    ...actual,
    getAppDataRoot: () => holder.appDataRoot,
    getConfigPath: () => join(holder.appDataRoot, "config.json"),
  }
})

describe.skipIf(!runE2E)("OpenClawClientManager E2E", () => {
  let tmpDir: string
  let manager: typeof import("@/services/openclaw/openclawClientManager").openClawClientManager
  let latest: OpenClawSessionSnapshot | undefined
  const instanceId = "e2e-local"

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "openclaw-e2e-"))
    holder.appDataRoot = tmpDir
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(
      join(tmpDir, "config.json"),
      JSON.stringify({
        openclaw: {
          instances: {
            [instanceId]: {
              name: "E2E Local",
              gatewayUrl,
              authMode: "token",
              token: gatewayToken,
              enabled: true,
              agents: [],
            },
          },
        },
      }),
    )

    const module = await import("@/services/openclaw/openclawClientManager")
    manager = module.openClawClientManager
    manager.setEventSink((event: OpenClawSessionEvent) => {
      if (event.kind === "snapshot") latest = event.snapshot
    })
  })

  afterAll(() => {
    manager?.disposeAll()
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true })
  })

  it("连接本机 Gateway 并拉取 Agent 列表", async () => {
    const result = await manager.connect(instanceId)
    expect(result.status).toBe("connected")

    const fetched = await manager.fetchAgents(instanceId)
    expect(fetched.status).toBe("connected")
    expect(fetched.agents.length).toBeGreaterThan(0)
    expect(fetched.agents.every((agent) => agent.id.length > 0)).toBe(true)
  }, 30_000)

  it("绑定会话后发送任务并流式收到助手回复", async () => {
    const fetched = await manager.fetchAgents(instanceId)
    const agent = fetched.agents[0]
    if (!agent) throw new Error("no agent available on the test gateway")

    const sessionKey = `agent:${agent.id}:e2e-binding`
    await manager.bindSession(instanceId, agent.id, sessionKey)
    await manager.sendMessage({
      instanceId,
      agentId: agent.id,
      message: "Reply with exactly: PONG",
    })

    // 轮询权威快照，等待 run 结束且助手文本落定。
    const deadline = Date.now() + 90_000
    let snapshot = await manager.getSnapshot(instanceId, agent.id)
    while (Date.now() < deadline) {
      snapshot = await manager.getSnapshot(instanceId, agent.id)
      const assistant = snapshot.messages.filter((message) => message.role === "assistant").at(-1)
      if (assistant && assistant.status !== "streaming" && assistant.content.trim()) break
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    const assistant = snapshot.messages.filter((message) => message.role === "assistant").at(-1)

    expect(snapshot.sessionKey).toBe(sessionKey)
    expect(assistant?.content.trim().toUpperCase()).toContain("PONG")
    expect(snapshot.isStreaming).toBe(false)
    expect(snapshot.messages.some((message) => message.role === "user")).toBe(true)
    // 事件出口确实推送过快照（主进程 → 渲染进程的投影通道）。
    expect(latest).toBeDefined()
  }, 120_000)

  it("listSessions 返回该 Agent 的 Gateway 会话列表", async () => {
    const fetched = await manager.fetchAgents(instanceId)
    const agent = fetched.agents[0]
    if (!agent) throw new Error("no agent available on the test gateway")

    const sessions = await manager.listSessions(instanceId, agent.id)

    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.every((session) => session.key.length > 0)).toBe(true)
  }, 30_000)

  it("bindSession 切换绑定并清空本地投影", async () => {
    const fetched = await manager.fetchAgents(instanceId)
    const agent = fetched.agents[0]
    if (!agent) throw new Error("no agent available on the test gateway")

    const before = await manager.getSnapshot(instanceId, agent.id)
    const nextKey = `agent:${agent.id}:e2e-switched`
    await manager.bindSession(instanceId, agent.id, nextKey)
    const after = await manager.getSnapshot(instanceId, agent.id)

    expect(after.sessionKey).not.toBe(before.sessionKey)
    expect(after.sessionKey).toBe(nextKey)
  }, 30_000)
})
