import { type ChildProcess, spawn } from "node:child_process"
import { getShellConfig, killProcessTree } from "../jobs/jobRegistry"
import { DEFAULT_UNIFIED_EXEC_OUTPUT_MAX_BYTES, HeadTailBuffer } from "./headTailBuffer"

export const MIN_YIELD_TIME_MS = 250
export const MAX_YIELD_TIME_MS = 30_000
export const DEFAULT_YIELD_TIME_MS = 10_000

export function clampYieldTime(ms?: number): number {
  if (ms === undefined || !Number.isFinite(ms)) {
    return DEFAULT_YIELD_TIME_MS
  }
  return Math.min(Math.max(ms, MIN_YIELD_TIME_MS), MAX_YIELD_TIME_MS)
}

export type ProcessStatus = "running" | "completed" | "failed" | "killed"

export interface UnifiedExecCommandOptions {
  command: string
  cwd: string
  sessionId?: string
  yieldTimeMs?: number
  maxOutputBytes?: number
  signal?: AbortSignal
  env?: Record<string, string>
}

export interface UnifiedExecStdinOptions {
  processId: number
  input: string
  yieldTimeMs?: number
  signal?: AbortSignal
}

export interface UnifiedExecResult {
  processId: number
  output: string
  exitCode: number | null
  isRunning: boolean
  status: ProcessStatus
  totalBytes: number
  omittedBytes: number
  timedOut?: boolean
  aborted?: boolean
}

export interface ProcessEntry {
  processId: number
  command: string
  cwd: string
  sessionId?: string
  child: ChildProcess
  buffer: HeadTailBuffer
  status: ProcessStatus
  exitCode: number | null
  startedAt: number
  finishedAt?: number
  lastYieldedByteOffset: number
  listeners: Array<() => void>
}

export class UnifiedExecManager {
  private nextProcessId = 1
  private readonly processes = new Map<number, ProcessEntry>()

  /**
   * Allocate next unique process ID.
   */
  public allocateProcessId(): number {
    return this.nextProcessId++
  }

  /**
   * Execute a command with unified buffering, yield timeout, and process tracking.
   */
  public async execCommand(options: UnifiedExecCommandOptions): Promise<UnifiedExecResult> {
    const processId = this.allocateProcessId()
    const yieldTimeMs = clampYieldTime(options.yieldTimeMs)
    const shellConfig = getShellConfig()

    const buffer = new HeadTailBuffer({
      maxBytes: options.maxOutputBytes ?? DEFAULT_UNIFIED_EXEC_OUTPUT_MAX_BYTES,
    })

    const child = spawn(
      shellConfig.shell,
      shellConfig.commandTransport === "stdin"
        ? shellConfig.args
        : [...shellConfig.args, options.command],
      {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    )

    if (shellConfig.commandTransport === "stdin") {
      child.stdin?.on("error", () => {})
      child.stdin?.end(options.command)
    }

    const entry: ProcessEntry = {
      processId,
      command: options.command,
      cwd: options.cwd,
      sessionId: options.sessionId,
      child,
      buffer,
      status: "running",
      exitCode: null,
      startedAt: Date.now(),
      lastYieldedByteOffset: 0,
      listeners: [],
    }

    this.processes.set(processId, entry)

    const notifyListeners = (): void => {
      for (const listener of [...entry.listeners]) {
        listener()
      }
    }

    child.stdout?.on("data", (data: Buffer) => {
      buffer.pushChunk(data)
      notifyListeners()
    })

    child.stderr?.on("data", (data: Buffer) => {
      buffer.pushChunk(data)
      notifyListeners()
    })

    child.on("exit", (code) => {
      entry.exitCode = code
      entry.finishedAt = Date.now()
      if (entry.status !== "killed") {
        entry.status = code === 0 ? "completed" : "failed"
      }
      notifyListeners()
    })

    child.on("error", (err) => {
      entry.exitCode = -1
      entry.finishedAt = Date.now()
      entry.status = "failed"
      buffer.pushChunk(`\nProcess spawn error: ${err.message}\n`)
      notifyListeners()
    })

    // Handle abort signal
    let abortListener: (() => void) | undefined
    if (options.signal) {
      abortListener = () => {
        this.killProcess(processId, "SIGTERM")
      }
      if (options.signal.aborted) {
        abortListener()
      } else {
        options.signal.addEventListener("abort", abortListener, { once: true })
      }
    }

    try {
      // Wait for exit OR yield timeout
      await this.waitForYieldOrExit(entry, yieldTimeMs)

      const isRunning = entry.status === "running"
      const output = buffer.toStringWithOmissionMarker()
      entry.lastYieldedByteOffset = buffer.totalBytes()

      return {
        processId,
        output,
        exitCode: entry.exitCode,
        isRunning,
        status: entry.status,
        totalBytes: buffer.totalBytes(),
        omittedBytes: buffer.omittedBytes(),
        aborted: options.signal?.aborted,
      }
    } finally {
      if (options.signal && abortListener) {
        options.signal.removeEventListener("abort", abortListener)
      }
    }
  }

  /**
   * Write to stdin of a running process and wait up to yieldTimeMs for subsequent output.
   */
  public async writeStdin(options: UnifiedExecStdinOptions): Promise<UnifiedExecResult> {
    const entry = this.processes.get(options.processId)
    if (!entry) {
      throw new Error(`Process ${options.processId} not found in UnifiedExec registry.`)
    }

    if (entry.status !== "running") {
      return {
        processId: entry.processId,
        output: entry.buffer.toStringWithOmissionMarker(),
        exitCode: entry.exitCode,
        isRunning: false,
        status: entry.status,
        totalBytes: entry.buffer.totalBytes(),
        omittedBytes: entry.buffer.omittedBytes(),
      }
    }

    const yieldTimeMs = clampYieldTime(options.yieldTimeMs)
    const initialBytes = entry.buffer.totalBytes()

    // Write input to stdin
    if (entry.child.stdin && !entry.child.stdin.destroyed) {
      entry.child.stdin.write(options.input.endsWith("\n") ? options.input : `${options.input}\n`)
    }

    await this.waitForOutputOrExit(entry, yieldTimeMs, initialBytes)

    const isRunning = entry.status === "running"
    return {
      processId: entry.processId,
      output: entry.buffer.toStringWithOmissionMarker(),
      exitCode: entry.exitCode,
      isRunning,
      status: entry.status,
      totalBytes: entry.buffer.totalBytes(),
      omittedBytes: entry.buffer.omittedBytes(),
      aborted: options.signal?.aborted,
    }
  }

  private waitForYieldOrExit(entry: ProcessEntry, timeoutMs: number): Promise<void> {
    if (entry.status !== "running") {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | undefined
      let settled = false

      const finish = (): void => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        const idx = entry.listeners.indexOf(check)
        if (idx !== -1) entry.listeners.splice(idx, 1)
        resolve()
      }

      const check = (): void => {
        if (entry.status !== "running") {
          finish()
        }
      }

      timer = setTimeout(finish, timeoutMs)
      entry.listeners.push(check)
    })
  }

  private waitForOutputOrExit(
    entry: ProcessEntry,
    timeoutMs: number,
    initialBytes: number,
  ): Promise<void> {
    if (entry.status !== "running") {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      let timer: NodeJS.Timeout | undefined
      let settled = false

      const finish = (): void => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        const idx = entry.listeners.indexOf(check)
        if (idx !== -1) entry.listeners.splice(idx, 1)
        resolve()
      }

      const check = (): void => {
        if (entry.status !== "running" || entry.buffer.totalBytes() > initialBytes) {
          finish()
        }
      }

      timer = setTimeout(finish, timeoutMs)
      entry.listeners.push(check)
    })
  }

  /**
   * Kill a process by processId.
   */
  public killProcess(processId: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): boolean {
    const entry = this.processes.get(processId)
    if (!entry) return false

    if (entry.status === "running") {
      entry.status = "killed"
      entry.finishedAt = Date.now()
      if (entry.child.pid) {
        killProcessTree(entry.child.pid, signal)
        if (signal === "SIGTERM") {
          setTimeout(() => {
            if (entry.child.pid && !entry.child.killed) {
              killProcessTree(entry.child.pid, "SIGKILL")
            }
          }, 1500)
        }
      }
    }
    return true
  }

  /**
   * Retrieve process entry.
   */
  public getProcess(processId: number): ProcessEntry | undefined {
    return this.processes.get(processId)
  }

  /**
   * List all processes, optionally filtered by sessionId.
   */
  public listProcesses(sessionId?: string): ProcessEntry[] {
    const results: ProcessEntry[] = []
    for (const p of this.processes.values()) {
      if (!sessionId || p.sessionId === sessionId) {
        results.push(p)
      }
    }
    return results.sort((a, b) => a.startedAt - b.startedAt)
  }

  /**
   * Clean up all processes belonging to a sessionId.
   */
  public clearSession(sessionId: string): void {
    for (const [id, p] of Array.from(this.processes.entries())) {
      if (p.sessionId === sessionId) {
        this.killProcess(id, "SIGKILL")
        this.processes.delete(id)
      }
    }
  }

  /**
   * Reset the entire manager (mainly for testing).
   */
  public reset(): void {
    for (const id of Array.from(this.processes.keys())) {
      this.killProcess(id, "SIGKILL")
    }
    this.processes.clear()
    this.nextProcessId = 1
  }
}

export const unifiedExecManager = new UnifiedExecManager()
