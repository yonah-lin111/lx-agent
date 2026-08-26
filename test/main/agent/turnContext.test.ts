import { describe, expect, it } from "vitest"
import { TurnContext } from "@/agent/core/turnContext"
import { tmpdir } from "node:os"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"

describe("TurnContext", () => {
  it("正确初始化环境切片与快照元数据", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lx-turn-test-"))
    try {
      const turn = new TurnContext({
        turnId: "turn-test-1",
        sessionId: "sess-test-1",
        cwd: tmp,
        capabilities: ["read", "write", "bash"],
        modelSelection: { provider: "anthropic", model: "claude-3-5-sonnet" },
      })

      expect(turn.turnId).toBe("turn-test-1")
      expect(turn.sessionId).toBe("sess-test-1")
      expect(turn.snapshot.cwd).toBe(tmp)
      expect(turn.capabilities).toEqual(["read", "write", "bash"])
      expect(turn.modelSelection?.model).toBe("claude-3-5-sonnet")
      expect(turn.getToolCallCount()).toBe(0)

      turn.recordToolCall()
      turn.recordToolCall()
      expect(turn.getToolCallCount()).toBe(2)
      expect(turn.getDurationMs()).toBeGreaterThanOrEqual(0)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
