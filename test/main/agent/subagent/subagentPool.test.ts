import { describe, expect, it, vi } from "vitest"
import type { Agent } from "@/agent/core/agent"
import { type ManagedSubagent, SubagentPool } from "@/agent/subagent/subagentPool"

// 测试桩 agent：running 时暴露 signal（等价于存在活动 run），记录 abort 调用。
const makeAgent = (running = false): { agent: Agent; abort: ReturnType<typeof vi.fn> } => {
  const abort = vi.fn()
  const controller = new AbortController()
  const agent = {
    get signal() {
      return running ? controller.signal : undefined
    },
    abort,
  } as unknown as Agent
  return { agent, abort }
}

// 构造池条目。
const makeItem = (
  subagentId: string,
  lastActiveAt: number,
  running = false,
): { item: ManagedSubagent; abort: ReturnType<typeof vi.fn> } => {
  const { agent, abort } = makeAgent(running)
  return {
    item: { subagentId, name: subagentId, agent, createdAt: lastActiveAt, lastActiveAt },
    abort,
  }
}

describe("SubagentPool 容量与回收", () => {
  it("超容量淘汰最久未活跃的非运行条目", () => {
    const pool = new SubagentPool({ maxSize: 2 })
    const now = Date.now()
    const a = makeItem("a", now - 30)
    const b = makeItem("b", now - 20)
    const c = makeItem("c", now - 10)

    pool.set("a", a.item)
    pool.set("b", b.item)
    pool.set("c", c.item)

    expect(
      pool
        .list()
        .map((item) => item.subagentId)
        .sort(),
    ).toEqual(["b", "c"])
    expect(a.abort).toHaveBeenCalledTimes(1)
    expect(b.abort).not.toHaveBeenCalled()
    expect(c.abort).not.toHaveBeenCalled()
  })

  it("运行中的条目跳过淘汰（淘汰最旧的非运行条目）", () => {
    const pool = new SubagentPool({ maxSize: 2 })
    const now = Date.now()
    const running = makeItem("running", now - 30, true)
    const idle = makeItem("idle", now - 20)
    const fresh = makeItem("fresh", now - 10)

    pool.set("running", running.item)
    pool.set("idle", idle.item)
    // running 最旧但在运行：跳过，淘汰 idle 以维持容量。
    pool.set("fresh", fresh.item)

    expect(pool.has("running")).toBe(true)
    expect(pool.has("idle")).toBe(false)
    expect(pool.has("fresh")).toBe(true)
    expect(running.abort).not.toHaveBeenCalled()
    expect(idle.abort).toHaveBeenCalledTimes(1)
  })

  it("空闲 TTL：resolve 触发惰性清理", () => {
    const pool = new SubagentPool({ idleTtlMs: 100 })
    const stale = makeItem("stale", Date.now())
    const live = makeItem("live", Date.now())
    pool.set("stale", stale.item)
    pool.set("live", live.item)
    // 注册后模拟长时间空闲：resolve 触发惰性回收。
    stale.item.lastActiveAt = Date.now() - 10_000

    expect(pool.resolve("stale")).toBeUndefined()
    expect(pool.has("stale")).toBe(false)
    expect(stale.abort).toHaveBeenCalledTimes(1)
    expect(pool.resolve("live")).toBe(live.item)
  })

  it("list 返回当前全部条目", () => {
    const pool = new SubagentPool()
    const now = Date.now()
    pool.set("a", makeItem("a", now).item)
    pool.set("b", makeItem("b", now).item)
    expect(pool.list()).toHaveLength(2)
  })
})
