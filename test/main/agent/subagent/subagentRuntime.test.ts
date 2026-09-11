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
