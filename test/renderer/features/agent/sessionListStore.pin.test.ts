// @vitest-environment jsdom

import type { AgentSessionSummary } from "@shared/contracts/agent"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { listSessions } = vi.hoisted(() => ({ listSessions: vi.fn() }))

vi.mock("@/features/agent/api/agentApi", () => ({
  agentApi: {
    listSessions,
    setSessionPinned: vi.fn(),
  },
}))

import { sessionListStore } from "@/features/agent/hooks/sessionListStore"

// 构造会话摘要。
const createSession = (overrides: Partial<AgentSessionSummary>): AgentSessionSummary => ({
  id: "s1",
  title: "Alpha session",
  cwd: "/tmp/alpha",
  projectId: "p1",
  pinned: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
})

describe("sessionListStore 置顶与批量删除", () => {
  beforeEach(async () => {
    // 模拟 main 侧已按 pinned DESC, updated_at DESC 排好序的返回。
    listSessions.mockResolvedValue([
      createSession({ id: "b", pinned: true, updatedAt: "2026-01-01T00:00:00.000Z" }),
      createSession({ id: "a", updatedAt: "2026-01-03T00:00:00.000Z" }),
      createSession({ id: "c", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ])
    await sessionListStore.refresh()
  })

  it("updateSessionPinned 置顶后重排到最前，取消后按更新时间归位", () => {
    expect(sessionListStore.getSessions().map((session) => session.id)).toEqual(["b", "a", "c"])

    sessionListStore.updateSessionPinned("a", true)
    expect(sessionListStore.getSessions().map((session) => session.id)).toEqual(["a", "b", "c"])

    sessionListStore.updateSessionPinned("b", false)
    expect(sessionListStore.getSessions().map((session) => session.id)).toEqual(["a", "c", "b"])
  })

  it("removeSessions 一次移除多条并清理 pending 集合", () => {
    sessionListStore.setSessionTitlePending("a")
    sessionListStore.removeSessions(["a", "c"])
    expect(sessionListStore.getSessions().map((session) => session.id)).toEqual(["b"])
    expect(sessionListStore.getPendingSessionIds().has("a")).toBe(false)
  })
})
