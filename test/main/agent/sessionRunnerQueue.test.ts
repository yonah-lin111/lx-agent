import { describe, expect, it, vi } from "vitest"
import { kickDrain } from "@/agent/sessionRunnerQueue"

describe("kickDrain 错误边界", () => {
  it("runOne 抛错时继续执行剩余消息且不向外抛出", async () => {
    const executed: string[] = []
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const host = {
        draining: false,
        messageQueue: [{ text: "a" }, { text: "b" }, { text: "c" }],
        emitEvent: vi.fn(),
        runOne: vi.fn(async (text: string) => {
          executed.push(text)
          if (text === "b") throw new Error("runOne boom")
          return { ok: true as const, sessionId: "s1" }
        }),
      }

      await expect(kickDrain(host)).resolves.toBeUndefined()

      expect(executed).toEqual(["a", "b", "c"])
      expect(host.messageQueue).toHaveLength(0)
      expect(host.draining).toBe(false)
      expect(errorSpy).toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it("draining 置位期间重入直接返回", async () => {
    const host = {
      draining: true,
      messageQueue: [{ text: "a" }],
      emitEvent: vi.fn(),
      runOne: vi.fn(async () => ({ ok: true as const, sessionId: "s1" })),
    }

    await kickDrain(host)

    expect(host.runOne).not.toHaveBeenCalled()
    expect(host.messageQueue).toHaveLength(1)
  })
})
