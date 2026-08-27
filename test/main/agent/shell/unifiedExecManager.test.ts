import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  clampYieldTime,
  DEFAULT_YIELD_TIME_MS,
  MAX_YIELD_TIME_MS,
  MIN_YIELD_TIME_MS,
  unifiedExecManager,
} from "@/agent/shell/unifiedExecManager"

describe("UnifiedExecManager", () => {
  beforeEach(() => {
    unifiedExecManager.reset()
  })

  afterEach(() => {
    unifiedExecManager.reset()
  })

  describe("clampYieldTime", () => {
    it("clamps values to [MIN_YIELD_TIME_MS, MAX_YIELD_TIME_MS]", () => {
      expect(clampYieldTime(50)).toBe(MIN_YIELD_TIME_MS)
      expect(clampYieldTime(50_000)).toBe(MAX_YIELD_TIME_MS)
      expect(clampYieldTime(5_000)).toBe(5_000)
      expect(clampYieldTime(undefined)).toBe(DEFAULT_YIELD_TIME_MS)
    })
  })

  describe("execCommand", () => {
    it("executes short command and captures output and exit code", async () => {
      const result = await unifiedExecManager.execCommand({
        command: "echo 'hello from unified exec'",
        cwd: process.cwd(),
        yieldTimeMs: 5000,
      })

      expect(result.exitCode).toBe(0)
      expect(result.isRunning).toBe(false)
      expect(result.status).toBe("completed")
      expect(result.output.trim()).toBe("hello from unified exec")
      expect(result.processId).toBeGreaterThanOrEqual(1)
    })

    it("yields long-running command when yield timeout is reached", async () => {
      const result = await unifiedExecManager.execCommand({
        command: "sleep 2; echo done",
        cwd: process.cwd(),
        yieldTimeMs: 250, // Minimum yield time
      })

      expect(result.isRunning).toBe(true)
      expect(result.status).toBe("running")

      const processEntry = unifiedExecManager.getProcess(result.processId)
      expect(processEntry).toBeDefined()

      // Cleanup
      unifiedExecManager.killProcess(result.processId)
    })

    it("handles abort signal properly", async () => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 100)

      const result = await unifiedExecManager.execCommand({
        command: "sleep 5",
        cwd: process.cwd(),
        yieldTimeMs: 2000,
        signal: controller.signal,
      })

      expect(result.aborted).toBe(true)
    })
  })

  describe("writeStdin and interactive flow", () => {
    it("writes input to stdin of running process", async () => {
      const execResult = await unifiedExecManager.execCommand({
        command: "cat",
        cwd: process.cwd(),
        yieldTimeMs: 250,
      })

      expect(execResult.isRunning).toBe(true)

      const stdinResult = await unifiedExecManager.writeStdin({
        processId: execResult.processId,
        input: "ping message\n",
        yieldTimeMs: 300,
      })

      expect(stdinResult.output).toContain("ping message")
      unifiedExecManager.killProcess(execResult.processId)
    })
  })

  describe("session lifecycle and cleanup", () => {
    it("clears all processes for a session", async () => {
      await unifiedExecManager.execCommand({
        command: "sleep 5",
        cwd: process.cwd(),
        sessionId: "sess-123",
        yieldTimeMs: 250,
      })

      expect(unifiedExecManager.listProcesses("sess-123")).toHaveLength(1)
      unifiedExecManager.clearSession("sess-123")
      expect(unifiedExecManager.listProcesses("sess-123")).toHaveLength(0)
    })
  })
})
