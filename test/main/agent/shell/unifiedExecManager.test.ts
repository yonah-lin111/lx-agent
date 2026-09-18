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

  describe("waitForExit", () => {
    it("等待超出首次 yield 的命令直至真实退出", async () => {
      const started = await unifiedExecManager.execCommand({
        command: "sleep 1; echo finished",
        cwd: process.cwd(),
        yieldTimeMs: 250,
      })
      expect(started.isRunning).toBe(true)

      const finished = await unifiedExecManager.waitForExit(started.processId, 5000)

      expect(finished?.isRunning).toBe(false)
      expect(finished?.status).toBe("completed")
      expect(finished?.output).toContain("finished")
    })

    it("预算用尽时返回运行中状态（由调用方决定终止）", async () => {
      const started = await unifiedExecManager.execCommand({
        command: "sleep 5",
        cwd: process.cwd(),
        yieldTimeMs: 250,
      })

      const stillRunning = await unifiedExecManager.waitForExit(started.processId, 200)

      expect(stillRunning?.isRunning).toBe(true)
      unifiedExecManager.killProcess(started.processId)
    })

    it("条目已被回收时返回 undefined", async () => {
      expect(await unifiedExecManager.waitForExit(99999, 100)).toBeUndefined()
    })
  })

  describe("pruneCompleted", () => {
    it("清理超过保留期的已完成条目，运行中条目保留", async () => {
      const finished = await unifiedExecManager.execCommand({
        command: "echo done",
        cwd: process.cwd(),
        yieldTimeMs: 5000,
      })
      const running = await unifiedExecManager.execCommand({
        command: "sleep 5",
        cwd: process.cwd(),
        yieldTimeMs: 250,
      })

      expect(unifiedExecManager.getProcess(finished.processId)).toBeDefined()
      const pruned = unifiedExecManager.pruneCompleted(0)

      expect(pruned).toBe(1)
      expect(unifiedExecManager.getProcess(finished.processId)).toBeUndefined()
      expect(unifiedExecManager.getProcess(running.processId)).toBeDefined()
      unifiedExecManager.killProcess(running.processId)
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

    it("removes the entry from the registry after killProcess", async () => {
      const result = await unifiedExecManager.execCommand({
        command: "sleep 5",
        cwd: process.cwd(),
        sessionId: "sess-kill",
        yieldTimeMs: 250,
      })

      expect(unifiedExecManager.getProcess(result.processId)).toBeDefined()
      expect(unifiedExecManager.listProcesses("sess-kill")).toHaveLength(1)

      expect(unifiedExecManager.killProcess(result.processId)).toBe(true)
      expect(unifiedExecManager.getProcess(result.processId)).toBeUndefined()
      expect(unifiedExecManager.listProcesses("sess-kill")).toHaveLength(0)
      expect(unifiedExecManager.killProcess(result.processId)).toBe(false)
    })
  })
})
