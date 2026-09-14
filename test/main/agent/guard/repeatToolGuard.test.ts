import { describe, expect, it } from "vitest"
import {
  canonicalizeValue,
  computeToolFingerprint,
  RepeatToolGuard,
} from "../../../../src/main/agent/guard/repeatToolGuard"

describe("RepeatToolGuard", () => {
  it("should canonicalize object keys deterministically", () => {
    const objA = { b: 2, a: 1, c: { z: 10, y: 20 } }
    const objB = { a: 1, c: { y: 20, z: 10 }, b: 2 }
    expect(JSON.stringify(canonicalizeValue(objA))).toBe(JSON.stringify(canonicalizeValue(objB)))
    expect(computeToolFingerprint("read", objA)).toBe(computeToolFingerprint("read", objB))
  })

  it("should increment exactly once per call and fire warning 3 / warning 5 / block 7", () => {
    const guard = new RepeatToolGuard()
    const sessionId = "session-sequence"
    const args = { path: "foo.ts" }

    // 1st / 2nd call: silent.
    for (const _ of [1, 2]) {
      const res = guard.record(sessionId, "read", args)
      expect(res.blocked).toBe(false)
      expect(res.reminder).toBeUndefined()
    }

    // 3rd call: first warning.
    const third = guard.record(sessionId, "read", args)
    expect(third.blocked).toBe(false)
    expect(third.reminder).toContain("Warning: You are repeating the exact same tool call")
    expect(third.reminder).toContain("for 3 consecutive times")

    // 4th call: silent again (no reminder loss, count is exact).
    const fourth = guard.record(sessionId, "read", args)
    expect(fourth.blocked).toBe(false)
    expect(fourth.reminder).toBeUndefined()

    // 5th call: critical warning with count 5.
    const fifth = guard.record(sessionId, "read", args)
    expect(fifth.blocked).toBe(false)
    expect(fifth.reminder).toContain("Critical Warning: Repeated tool call detected")
    expect(fifth.reminder).toContain("consecutive_calls=5")

    // 6th call: silent.
    const sixth = guard.record(sessionId, "read", args)
    expect(sixth.blocked).toBe(false)
    expect(sixth.reminder).toBeUndefined()

    // 7th call: hard block.
    const seventh = guard.record(sessionId, "read", args)
    expect(seventh.blocked).toBe(true)
    expect(seventh.blockReason).toContain(
      'Execution blocked: Tool "read" has been called 7 consecutive times',
    )

    // Blocked state persists until the fingerprint changes.
    const eighth = guard.record(sessionId, "read", args)
    expect(eighth.blocked).toBe(true)
  })

  it("should keep transparent tools out of the chain (no increment, no reset)", () => {
    const guard = new RepeatToolGuard({
      warningThresholds: [2],
      blockThreshold: 4,
      transparentTools: ["todowrite"],
    })
    const sessionId = "session-transparent"
    const args = { path: "foo.ts" }

    guard.record(sessionId, "read", args)
    // 透明工具既不递增也不打断连续计数（第 2 次 read 仍命中阈值）。
    const transparent = guard.record(sessionId, "todowrite", { todos: [] })
    expect(transparent.blocked).toBe(false)
    expect(transparent.reminder).toBeUndefined()

    const second = guard.record(sessionId, "read", args)
    expect(second.reminder).toBeDefined()
    expect(second.reminder).toContain("for 2 consecutive times")
  })

  it("should reset consecutive count when different tool or arguments are used", () => {
    const guard = new RepeatToolGuard({
      warningThresholds: [2],
      blockThreshold: 4,
    })
    const sessionId = "session-2"

    guard.record(sessionId, "read", { path: "a.ts" })
    const warned = guard.record(sessionId, "read", { path: "a.ts" })
    expect(warned.reminder).toBeDefined()

    // Change argument -> resets count
    const changed = guard.record(sessionId, "read", { path: "b.ts" })
    expect(changed.blocked).toBe(false)
    expect(changed.reminder).toBeUndefined()

    // Repeat new argument -> starts fresh count to 2
    const secondCall = guard.record(sessionId, "read", { path: "b.ts" })
    expect(secondCall.reminder).toBeDefined()
  })

  it("should isolate sessions and support resetSession", () => {
    const guard = new RepeatToolGuard({ warningThresholds: [2], blockThreshold: 3 })
    const args = { path: "foo.ts" }

    guard.record("session-a", "read", args)
    guard.record("session-a", "read", args)
    // 另一会话独立计数：仍是第 1 次。
    const otherSession = guard.record("session-b", "read", args)
    expect(otherSession.blocked).toBe(false)
    expect(otherSession.reminder).toBeUndefined()

    guard.resetSession("session-a")
    // 重置后从第 1 次重新开始。
    const afterReset = guard.record("session-a", "read", args)
    expect(afterReset.blocked).toBe(false)
    expect(afterReset.reminder).toBeUndefined()
  })
})
