// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  type BtwThread,
  btwStore,
  getBtwOwnerKey,
  toBtwContextMessages,
} from "@/features/agent/hooks/btwStore"

describe("getBtwOwnerKey", () => {
  it("优先使用 sessionId，草稿态回退到 tab key，都缺省返回 null", () => {
    expect(getBtwOwnerKey("s1", "tab-1")).toBe("s1")
    expect(getBtwOwnerKey(null, "tab-1")).toBe("tab:tab-1")
    expect(getBtwOwnerKey(null, undefined)).toBeNull()
  })
})

describe("btwStore 侧问线切分与清理", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("同锚点并入同一侧问线，锚点变化新建侧问线", () => {
    btwStore.appendUser("split-sess", 1000, "Q1")
    btwStore.appendUser("split-sess", 1000, "Q2")
    btwStore.appendUser("split-sess", 2000, "Q3")

    const threads = btwStore.getThreads("split-sess")
    expect(threads).toHaveLength(2)
    expect(threads[0]?.anchor).toBe(1000)
    expect(threads[0]?.messages.map((message) => message.content)).toEqual(["Q1", "Q2"])
    expect(threads[1]?.anchor).toBe(2000)
    expect(threads[1]?.messages.map((message) => message.content)).toEqual(["Q3"])
  })

  it("回答追加到指定侧问线，失败回答以 failed 标记", () => {
    const { threadId } = btwStore.appendUser("answer-sess", 1000, "Q1")
    btwStore.appendAssistant("answer-sess", threadId, "A1")
    btwStore.appendAssistant("answer-sess", threadId, "boom", true)

    const thread = btwStore.getThreads("answer-sess")[0] as BtwThread
    expect(thread.messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "assistant",
    ])
    expect(thread.messages.at(-1)?.failed).toBe(true)
  })

  it("删除锚点清理对应侧问线，其他锚点不受影响", () => {
    btwStore.appendUser("prune-sess", 1000, "Q1")
    btwStore.appendUser("prune-sess", 2000, "Q2")

    btwStore.removeThreadsByAnchor("prune-sess", 1000)

    const threads = btwStore.getThreads("prune-sess")
    expect(threads).toHaveLength(1)
    expect(threads[0]?.anchor).toBe(2000)
  })

  it("删除不存在的锚点为空操作", () => {
    btwStore.appendUser("prune-noop-sess", 1000, "Q1")
    btwStore.removeThreadsByAnchor("prune-noop-sess", 9999)
    expect(btwStore.getThreads("prune-noop-sess")).toHaveLength(1)
  })

  it("超过单会话消息上限时按最旧淘汰", () => {
    for (let index = 0; index < 60; index += 1) {
      const { threadId } = btwStore.appendUser("cap-sess", 1000, `Q${index}`)
      btwStore.appendAssistant("cap-sess", threadId, `A${index}`)
    }

    const threads = btwStore.getThreads("cap-sess")
    const total = threads.reduce((sum, thread) => sum + thread.messages.length, 0)
    expect(total).toBeLessThanOrEqual(100)
    // 120 条消息淘汰最旧 20 条后，首条应为 Q10。
    expect(threads[0]?.messages[0]?.content).toBe("Q10")
  })
})

describe("btwStore 持久化与迁移", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("已落库会话写入 localStorage，草稿态仅存内存", () => {
    btwStore.appendUser("persist-sess", 1000, "Q1")
    expect(localStorage.getItem("btw:history:persist-sess")).toContain("Q1")

    btwStore.appendUser("tab:draft-1", 1000, "Q2")
    expect(localStorage.getItem("btw:history:tab:draft-1")).toBeNull()
    expect(btwStore.getThreads("tab:draft-1")).toHaveLength(1)
  })

  it("草稿绑定会话后迁移并持久化，源 key 清空", () => {
    btwStore.appendUser("tab:draft-2", 1000, "Q1")

    btwStore.migrateOwner("tab:draft-2", "migrated-sess")

    expect(btwStore.getThreads("tab:draft-2")).toHaveLength(0)
    expect(btwStore.getThreads("migrated-sess")).toHaveLength(1)
    expect(localStorage.getItem("btw:history:migrated-sess")).toContain("Q1")
  })

  it("模块重新加载（重启）后从 localStorage 恢复侧问线", async () => {
    btwStore.appendUser("rehydrate-sess", 1000, "Q1")

    vi.resetModules()
    const fresh = await import("@/features/agent/hooks/btwStore")
    const threads = fresh.btwStore.getThreads("rehydrate-sess")

    expect(threads).toHaveLength(1)
    expect(threads[0]?.messages[0]?.content).toBe("Q1")
  })

  it("删除 owner 同时清理内存与 localStorage", () => {
    btwStore.appendUser("delete-sess", 1000, "Q1")

    btwStore.deleteOwner("delete-sess")

    expect(btwStore.getThreads("delete-sess")).toHaveLength(0)
    expect(localStorage.getItem("btw:history:delete-sess")).toBeNull()
  })
})

describe("toBtwContextMessages", () => {
  it("排除失败回答与空内容，保留问答角色", () => {
    const thread: BtwThread = {
      id: "t1",
      anchor: 1000,
      createdAt: 1,
      messages: [
        { id: "m1", role: "user", content: "Q1", createdAt: 1 },
        { id: "m2", role: "assistant", content: "A1", createdAt: 2 },
        { id: "m3", role: "assistant", content: "boom", createdAt: 3, failed: true },
        { id: "m4", role: "user", content: "   ", createdAt: 4 },
      ],
    }

    expect(toBtwContextMessages(thread)).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
    ])
  })
})
