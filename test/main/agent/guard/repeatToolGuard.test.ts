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

  it("should track consecutive calls and trigger warnings and blocks", () => {
    const guard = new RepeatToolGuard({
      warningThresholds: [2, 4],
      blockThreshold: 5,
      transparentTools: ["todowrite"],
    })
    const sessionId = "session-1"
    const args = { path: "foo.ts" }

    // 1st call: normal
    let res = guard.checkBeforeExecute(sessionId, "read", args)
    expect(res.blocked).toBe(false)
    expect(res.reminder).toBeUndefined()

    // 2nd call: triggers 1st warning
    res = guard.checkBeforeExecute(sessionId, "read", args)
    expect(res.blocked).toBe(false)
    expect(res.reminder).toContain("Warning: You are repeating the exact same tool call")

    // transparent tool call should not reset chain
    res = guard.checkBeforeExecute(sessionId, "todowrite", { todos: [] })
    expect(res.blocked).toBe(false)

    // 3rd consecutive read call (chain count = 3): normal
    res = guard.checkBeforeExecute(sessionId, "read", args)
    expect(res.blocked).toBe(false)
    expect(res.reminder).toBeUndefined()

    // 4th consecutive call: triggers 2nd warning
    res = guard.checkBeforeExecute(sessionId, "read", args)
    expect(res.blocked).toBe(false)
    expect(res.reminder).toContain("Critical Warning: Repeated tool call detected")

    // 5th consecutive call: blocked
    res = guard.checkBeforeExecute(sessionId, "read", args)
    expect(res.blocked).toBe(true)
    expect(res.blockReason).toContain(
      'Execution blocked: Tool "read" has been called 5 consecutive times',
    )
  })

  it("should reset consecutive count when different tool or arguments are used", () => {
    const guard = new RepeatToolGuard({
      warningThresholds: [2],
      blockThreshold: 4,
    })
    const sessionId = "session-2"

    guard.checkBeforeExecute(sessionId, "read", { path: "a.ts" })
    const warned = guard.checkBeforeExecute(sessionId, "read", { path: "a.ts" })
    expect(warned.reminder).toBeDefined()

    // Change argument -> resets count
    const changed = guard.checkBeforeExecute(sessionId, "read", { path: "b.ts" })
    expect(changed.blocked).toBe(false)
    expect(changed.reminder).toBeUndefined()

    // Repeat new argument -> starts fresh count to 2
    const secondCall = guard.checkBeforeExecute(sessionId, "read", { path: "b.ts" })
    expect(secondCall.reminder).toBeDefined()
  })
})
