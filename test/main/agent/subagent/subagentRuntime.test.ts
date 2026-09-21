import { describe, expect, it } from "vitest"
import { SubagentRuntime } from "@/agent/subagent/subagentRuntime"

describe("SubagentRuntime", () => {
  it("缺省不限并发：acquire 恒成功，limit 为 undefined", () => {
    const runtime = new SubagentRuntime()
    for (let i = 0; i < 100; i += 1) {
      expect(runtime.tryAcquire()).toBe(true)
    }
    expect(runtime.active).toBe(100)
    expect(runtime.limit).toBeUndefined()
  })

  it("达到上限后拒绝，release 恢复后重新可占用", () => {
    const runtime = new SubagentRuntime(2)
    expect(runtime.limit).toBe(2)
    expect(runtime.tryAcquire()).toBe(true)
    expect(runtime.tryAcquire()).toBe(true)
    expect(runtime.active).toBe(2)
    expect(runtime.tryAcquire()).toBe(false)
    expect(runtime.active).toBe(2)

    runtime.release()
    expect(runtime.active).toBe(1)
    expect(runtime.tryAcquire()).toBe(true)
    expect(runtime.tryAcquire()).toBe(false)
  })

  it("release 不会低于 0", () => {
    const runtime = new SubagentRuntime(1)
    runtime.release()
    expect(runtime.active).toBe(0)
    runtime.tryAcquire()
    runtime.release()
    runtime.release()
    expect(runtime.active).toBe(0)
    expect(runtime.tryAcquire()).toBe(true)
  })
})

describe("SubagentRuntime 同步租约", () => {
  it("空闲时同步占用，满时返回 null 且不排队，租约幂等释放", () => {
    const runtime = new SubagentRuntime(1)
    const lease = runtime.tryAcquireLease()
    expect(lease).not.toBeNull()
    expect(runtime.tryAcquireLease()).toBeNull()
    expect(runtime.waiting).toBe(0)
    lease?.()
    lease?.()
    expect(runtime.active).toBe(0)
  })
})

describe("SubagentRuntime 顶层排队", () => {
  it("达到上限且允许排队时挂起，release 后按 FIFO 授予槽位", async () => {
    const runtime = new SubagentRuntime(1)
    const first = await runtime.acquire({ queue: true })
    expect(first).not.toBeNull()
    expect(runtime.active).toBe(1)

    const order: string[] = []
    const second = runtime.acquire({ queue: true }).then((lease) => {
      order.push("second")
      return lease
    })
    const third = runtime.acquire({ queue: true }).then((lease) => {
      order.push("third")
      return lease
    })
    expect(runtime.waiting).toBe(2)

    first?.()
    const secondLease = await second
    expect(order).toEqual(["second"])
    expect(runtime.active).toBe(1)
    secondLease?.()
    const thirdLease = await third
    expect(order).toEqual(["second", "third"])
    thirdLease?.()
    expect(runtime.active).toBe(0)
  })

  it("release 直接把槽位移交队首，新到的 tryAcquire 不能插队", async () => {
    const runtime = new SubagentRuntime(1)
    const lease = await runtime.acquire({ queue: true })
    const queued = runtime.acquire({ queue: true })
    expect(runtime.waiting).toBe(1)

    lease?.()
    // 槽位已移交给排队者：计数仍为 1，新调用被拒。
    expect(runtime.tryAcquire()).toBe(false)

    const queuedLease = await queued
    expect(queuedLease).not.toBeNull()
    expect(runtime.active).toBe(1)
    queuedLease?.()
    expect(runtime.active).toBe(0)
  })

  it("不允许排队（嵌套）时达到上限立即返回 null", async () => {
    const runtime = new SubagentRuntime(1)
    runtime.tryAcquire()
    expect(await runtime.acquire({ queue: false })).toBeNull()
    expect(runtime.waiting).toBe(0)
    runtime.release()
    expect(await runtime.acquire({ queue: false })).not.toBeNull()
  })

  it("排队期间中止出队返回 null，不影响其余排队者", async () => {
    const runtime = new SubagentRuntime(1)
    const lease = await runtime.acquire({ queue: true })
    const controller = new AbortController()
    const aborted = runtime.acquire({ queue: true, signal: controller.signal })
    const survivor = runtime.acquire({ queue: true })
    expect(runtime.waiting).toBe(2)

    controller.abort()
    expect(await aborted).toBeNull()
    expect(runtime.waiting).toBe(1)

    lease?.()
    const survivorLease = await survivor
    expect(survivorLease).not.toBeNull()
    survivorLease?.()
    expect(runtime.active).toBe(0)
  })

  it("已中止信号直接拒绝且不进队", async () => {
    const runtime = new SubagentRuntime(1)
    runtime.tryAcquire()
    const controller = new AbortController()
    controller.abort()
    expect(await runtime.acquire({ queue: true, signal: controller.signal })).toBeNull()
    expect(runtime.waiting).toBe(0)
  })

  it("租约幂等：重复释放只归还一次", async () => {
    const runtime = new SubagentRuntime(1)
    const lease = await runtime.acquire({ queue: true })
    lease?.()
    lease?.()
    expect(runtime.active).toBe(0)
  })

  it("缺省不限并发时 acquire 恒成功且不排队", async () => {
    const runtime = new SubagentRuntime()
    const leases = await Promise.all([runtime.acquire(), runtime.acquire()])
    expect(leases.every((lease) => lease !== null)).toBe(true)
    expect(runtime.active).toBe(2)
    expect(runtime.waiting).toBe(0)
  })
})
