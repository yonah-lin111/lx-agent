import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { createWriteStream, existsSync, mkdirSync, readFileSync, type WriteStream } from "node:fs"
import { join } from "node:path"
import type {
  AgentEvent,
  JobId,
  JobKind,
  JobReadResult,
  JobSnapshot,
  JobStatus,
} from "@shared/contracts/agent"
import { spillManager } from "../spill/spillManager"

const MAX_CONCURRENT_JOBS_PER_SESSION = 10
const DEFAULT_WAIT_TIMEOUT_MS = 10_000
const MAX_WAIT_TIMEOUT_MS = 60_000
const MAX_MEMORY_BUFFER_BYTES = 64 * 1024 // 64KB 内存环形/截断缓冲

interface ShellConfig {
  shell: string
  args: string[]
  commandTransport?: "argv" | "stdin"
}

// Windows 上查找 bash.exe（Git Bash 常见路径 / PATH）。
const findBashOnPath = (): string | null => {
  try {
    const result = spawnSync("where", ["bash.exe"], {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    })
    if (result.status === 0 && result.stdout) {
      const firstMatch = result.stdout.trim().split(/\r?\n/)[0]
      if (firstMatch && existsSync(firstMatch)) return firstMatch
    }
  } catch {
    // 忽略
  }
  return null
}

// 解析 shell 配置。
export const getShellConfig = (): ShellConfig => {
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles
    const candidates: string[] = []
    if (programFiles) candidates.push(`${programFiles}\\Git\\bin\\bash.exe`)
    const programFilesX86 = process.env["ProgramFiles(x86)"]
    if (programFilesX86) candidates.push(`${programFilesX86}\\Git\\bin\\bash.exe`)
    for (const candidate of candidates) {
      if (existsSync(candidate)) return { shell: candidate, args: ["-c"] }
    }
    const bashOnPath = findBashOnPath()
    if (bashOnPath) return { shell: bashOnPath, args: ["-c"] }
    throw new Error("未找到 bash shell。请安装 Git for Windows 或将 bash 加入 PATH。")
  }

  if (existsSync("/bin/bash")) return { shell: "/bin/bash", args: ["-c"] }
  return { shell: "sh", args: ["-c"] }
}

// 终止进程树：Unix 按进程组负 pid，Windows 用 taskkill。
export const killProcessTree = (pid: number, signal: "SIGTERM" | "SIGKILL" = "SIGTERM"): void => {
  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true })
    } catch {
      // 忽略
    }
  } else {
    try {
      process.kill(-pid, signal)
    } catch {
      try {
        process.kill(pid, signal)
      } catch {
        // 进程可能已退出
      }
    }
  }
}

export interface JobStartSpec {
  kind: JobKind
  label?: string
  command: string
  cwd: string
  sessionId: string
  outputLimitBytes?: number
}

interface ActiveJobRecord {
  id: JobId
  kind: JobKind
  label: string
  command: string
  cwd: string
  sessionId: string
  status: JobStatus
  detail?: string
  startedAt: number
  finishedAt?: number
  pid?: number
  child?: ChildProcess
  outputChunks: string[]
  totalOutputBytes: number
  readCursor: number
  spillFilePath?: string
  spillStream?: WriteStream
  outputLimitBytes?: number
  reported: boolean
  waiters: Array<() => void>
}

export type JobSettledListener = (job: JobSnapshot) => void
export type JobEventListener = (event: AgentEvent) => void

export class LocalJobRegistry {
  private readonly jobs = new Map<JobId, ActiveJobRecord>()
  private readonly sessionCounters = new Map<string, number>()
  private readonly settledListeners = new Set<JobSettledListener>()
  private readonly eventListeners = new Set<JobEventListener>()

  /**
   * 启动并注册一个新的后台长任务。
   */
  startJob(spec: JobStartSpec): JobSnapshot {
    const runningJobsInSession = this.listJobs(spec.sessionId).filter(
      (j) => j.status === "running" || j.status === "stopping",
    )
    if (runningJobsInSession.length >= MAX_CONCURRENT_JOBS_PER_SESSION) {
      throw new Error(
        `当前会话后台任务并发超限（最多同时运行 ${MAX_CONCURRENT_JOBS_PER_SESSION} 个任务）。请使用 job_kill 终止无用任务后再试。`,
      )
    }

    const counter = (this.sessionCounters.get(spec.sessionId) ?? 0) + 1
    this.sessionCounters.set(spec.sessionId, counter)
    const jobId: JobId = `${spec.kind}-${counter}`
    const label = spec.label || spec.command

    const shellConfig = getShellConfig()
    const child = spawn(
      shellConfig.shell,
      shellConfig.commandTransport === "stdin"
        ? shellConfig.args
        : [...shellConfig.args, spec.command],
      {
        cwd: spec.cwd,
        detached: process.platform !== "win32",
        stdio: [shellConfig.commandTransport === "stdin" ? "pipe" : "ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    )

    if (shellConfig.commandTransport === "stdin") {
      child.stdin?.on("error", () => {})
      child.stdin?.end(spec.command)
    }

    const jobRecord: ActiveJobRecord = {
      id: jobId,
      kind: spec.kind,
      label,
      command: spec.command,
      cwd: spec.cwd,
      sessionId: spec.sessionId,
      status: "running",
      startedAt: Date.now(),
      pid: child.pid,
      child,
      outputChunks: [],
      totalOutputBytes: 0,
      readCursor: 0,
      outputLimitBytes: spec.outputLimitBytes,
      reported: false,
      waiters: [],
    }

    this.jobs.set(jobId, jobRecord)

    const handleData = (data: Buffer): void => {
      const text = data.toString("utf-8")
      jobRecord.outputChunks.push(text)
      jobRecord.totalOutputBytes += Buffer.byteLength(text, "utf-8")

      // 超过内存缓冲阈值时激活 Spill 文件
      if (jobRecord.totalOutputBytes > MAX_MEMORY_BUFFER_BYTES && !jobRecord.spillFilePath) {
        this.ensureSpillFile(jobRecord)
      }

      if (jobRecord.spillStream) {
        jobRecord.spillStream.write(text)
      }

      // 推送分片事件给 Renderer 抽屉
      this.emitEvent({
        type: "job_output_chunk",
        jobId: jobRecord.id,
        chunk: text,
      })

      // 唤醒所有正在等待输出的 waiter
      const pendingWaiters = [...jobRecord.waiters]
      jobRecord.waiters = []
      for (const waiter of pendingWaiters) {
        waiter()
      }
    }

    child.stdout?.on("data", handleData)
    child.stderr?.on("data", handleData)

    child.on("exit", (code, signal) => {
      this.settleJob(
        jobRecord,
        jobRecord.status === "stopping"
          ? "killed"
          : code === 0
            ? "completed"
            : "failed",
        code !== null ? `exit code: ${code}` : signal ? `signal: ${signal}` : undefined,
      )
    })

    child.on("error", (err) => {
      this.settleJob(jobRecord, "failed", `spawn error: ${err.message}`)
    })

    const initialSnapshot = this.toSnapshot(jobRecord)
    this.emitEvent({ type: "job_started", job: initialSnapshot })
    return initialSnapshot
  }

  private ensureSpillFile(job: ActiveJobRecord): void {
    if (job.spillFilePath) return
    try {
      const jobsDir = join(spillManager.getSessionDir(job.sessionId), "jobs")
      if (!existsSync(jobsDir)) {
        mkdirSync(jobsDir, { recursive: true })
      }
      const safeId = job.id.replace(/[^a-zA-Z0-9_-]/g, "_")
      const filePath = join(jobsDir, `${safeId}.log`)
      const stream = createWriteStream(filePath, { flags: "a", encoding: "utf-8" })
      job.spillFilePath = filePath
      job.spillStream = stream
      // 把此前累积的全部文本灌入 spill 文件
      for (const chunk of job.outputChunks) {
        stream.write(chunk)
      }
    } catch (err) {
      console.warn(`[LocalJobRegistry] Failed to initialize spill stream for job ${job.id}:`, err)
    }
  }

  private settleJob(job: ActiveJobRecord, status: JobStatus, detail?: string): void {
    if (job.status === "completed" || job.status === "failed" || job.status === "killed") {
      return
    }
    job.status = status
    job.finishedAt = Date.now()
    if (detail) {
      job.detail = detail
    }

    if (job.spillStream) {
      job.spillStream.end()
      job.spillStream = undefined
    }

    const snapshot = this.toSnapshot(job)

    // 唤醒所有 waiters
    const pendingWaiters = [...job.waiters]
    job.waiters = []
    for (const waiter of pendingWaiters) {
      waiter()
    }

    // 触发事件分发
    this.emitEvent({ type: "job_settled", job: snapshot })
    for (const listener of this.settledListeners) {
      try {
        listener(snapshot)
      } catch (err) {
        console.error(`[LocalJobRegistry] settledListener error for job ${job.id}:`, err)
      }
    }
  }

  /**
   * 获取指定任务的完整历史日志（优先从 Spill 落盘文件读取，兜底内存缓冲）。
   */
  getFullOutput(jobId: JobId, callerSessionId?: string): string | null {
    const job = this.jobs.get(jobId)
    if (!job) return null
    if (callerSessionId && job.sessionId !== callerSessionId) {
      throw new Error(`拒绝跨会话访问后台任务: ${jobId}`)
    }
    if (job.spillFilePath && existsSync(job.spillFilePath)) {
      try {
        return readFileSync(job.spillFilePath, "utf-8")
      } catch {
        // 忽略落盘读取异常，降级内存
      }
    }
    return job.outputChunks.join("")
  }

  /**
   * 读取任务输出：
   * - mode === "delta"（默认，供模型工具消费式增量读取，推进 readCursor）
   * - mode === "full"（供 UI 监控视口拉取完整历史日志，不污染增量游标）
   */
  async readOutput(
    jobId: JobId,
    wait?: boolean,
    timeoutMs?: number,
    callerSessionId?: string,
    mode: "delta" | "full" = "delta",
  ): Promise<JobReadResult | null> {
    const job = this.jobs.get(jobId)
    if (!job) return null
    if (callerSessionId && job.sessionId !== callerSessionId) {
      throw new Error(`拒绝跨会话访问后台任务: ${jobId}`)
    }

    if (mode === "full") {
      const fullText = this.getFullOutput(jobId, callerSessionId) ?? ""
      return {
        text: fullText,
        job: this.toSnapshot(job),
        hasMore: job.status === "running" || job.status === "stopping",
      }
    }

    const effectiveTimeout = Math.min(
      Math.max(100, timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS),
      MAX_WAIT_TIMEOUT_MS,
    )

    // 如果指定 wait 且当前是运行态且尚无新数据
    const allTextSoFar = job.outputChunks.join("")
    const currentUnread = allTextSoFar.slice(job.readCursor)

    if (wait && job.status === "running" && currentUnread.length === 0) {
      await new Promise<void>((resolve) => {
        let timer: NodeJS.Timeout | undefined
        const onWake = (): void => {
          if (timer) clearTimeout(timer)
          resolve()
        }
        timer = setTimeout(() => {
          const idx = job.waiters.indexOf(onWake)
          if (idx !== -1) job.waiters.splice(idx, 1)
          resolve()
        }, effectiveTimeout)
        job.waiters.push(onWake)
      })
    }

    const updatedText = job.outputChunks.join("")
    const deltaText = updatedText.slice(job.readCursor)
    job.readCursor = updatedText.length

    if (job.status !== "running" && job.status !== "stopping") {
      job.reported = true
    }

    return {
      text: deltaText,
      job: this.toSnapshot(job),
      hasMore: job.status === "running" || job.status === "stopping",
    }
  }

  /**
   * 终止指定的后台任务。
   */
  async killJob(
    jobId: JobId,
    reason?: string,
    callerSessionId?: string,
  ): Promise<{ ok: boolean; status?: JobStatus; error?: string }> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return { ok: false, error: `未找到后台任务: ${jobId}` }
    }
    if (callerSessionId && job.sessionId !== callerSessionId) {
      return { ok: false, error: `拒绝跨会话终止后台任务: ${jobId}` }
    }

    if (job.status !== "running" && job.status !== "stopping") {
      return { ok: true, status: job.status }
    }

    job.status = "stopping"
    job.detail = reason || "cancellation requested"

    if (job.pid) {
      killProcessTree(job.pid, "SIGTERM")
      // 2秒后若未退出，发送 SIGKILL 强杀
      setTimeout(() => {
        if (job.status === "stopping" && job.pid) {
          killProcessTree(job.pid, "SIGKILL")
        }
      }, 2000)
    }

    return { ok: true, status: "stopping" }
  }

  /**
   * 移除/关闭指定任务记录。
   * 若任务仍在运行，先执行 kill 终止进程树，再从 Map 中移除并释放资源。
   */
  async removeJob(
    jobId: JobId,
    callerSessionId?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const job = this.jobs.get(jobId)
    if (!job) {
      return { ok: false, error: `未找到后台任务: ${jobId}` }
    }
    if (callerSessionId && job.sessionId !== callerSessionId) {
      return { ok: false, error: `拒绝跨会话移除后台任务: ${jobId}` }
    }

    if (job.status === "running" || job.status === "stopping") {
      if (job.pid) {
        killProcessTree(job.pid, "SIGKILL")
      }
      try {
        job.spillStream?.end()
      } catch {
        // 忽略
      }
    }

    this.jobs.delete(jobId)
    return { ok: true }
  }

  /**
   * 清理指定会话全部已结束（completed / failed / killed）的后台长任务。
   */
  clearSettledJobs(sessionId: string): { count: number } {
    let count = 0
    for (const [id, job] of Array.from(this.jobs.entries())) {
      if (
        job.sessionId === sessionId &&
        (job.status === "completed" || job.status === "failed" || job.status === "killed")
      ) {
        try {
          job.spillStream?.end()
        } catch {
          // 忽略
        }
        this.jobs.delete(id)
        count++
      }
    }
    return { count }
  }

  /**
   * 获取指定任务的只读快照。
   */
  getJob(jobId: JobId): JobSnapshot | undefined {
    const job = this.jobs.get(jobId)
    return job ? this.toSnapshot(job) : undefined
  }

  /**
   * 列出指定会话（或全部）可见的任务列表。
   */
  listJobs(sessionId?: string): JobSnapshot[] {
    const list: JobSnapshot[] = []
    for (const job of this.jobs.values()) {
      if (!sessionId || job.sessionId === sessionId) {
        list.push(this.toSnapshot(job))
      }
    }
    return list.sort((a, b) => a.startedAt - b.startedAt)
  }

  /**
   * 会话销毁时清理所有相关后台任务。
   */
  cleanSessionJobs(sessionId: string): void {
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId) {
        if (job.status === "running" || job.status === "stopping") {
          if (job.pid) {
            killProcessTree(job.pid, "SIGKILL")
          }
          job.status = "killed"
          job.finishedAt = Date.now()
        }
        if (job.spillStream) {
          job.spillStream.end()
          job.spillStream = undefined
        }
        this.jobs.delete(job.id)
      }
    }
    this.sessionCounters.delete(sessionId)
  }

  onJobSettled(listener: JobSettledListener): () => void {
    this.settledListeners.add(listener)
    return () => this.settledListeners.delete(listener)
  }

  onJobEvent(listener: JobEventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  private emitEvent(event: AgentEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event)
      } catch (err) {
        console.error("[LocalJobRegistry] emitEvent error:", err)
      }
    }
  }

  private toSnapshot(job: ActiveJobRecord): JobSnapshot {
    return {
      id: job.id,
      kind: job.kind,
      label: job.label,
      status: job.status,
      detail: job.detail,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      pid: job.pid,
      sessionId: job.sessionId,
      outputLimitBytes: job.outputLimitBytes,
    }
  }
}

export const jobRegistry = new LocalJobRegistry()
