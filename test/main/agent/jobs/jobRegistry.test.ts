import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LocalJobRegistry, MAX_MEMORY_BUFFER_BYTES } from "@/agent/jobs/jobRegistry"
import { spillManager } from "@/agent/spill/spillManager"

const LARGE_OUTPUT_BYTES = 200_000
const TAIL_MARKER = "TAIL-MARKER"

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

describe("LocalJobRegistry", () => {
  let registry: LocalJobRegistry

  beforeEach(() => {
    registry = new LocalJobRegistry()
  })

  afterEach(() => {
    registry.cleanSessionJobs("test-session")
    registry.cleanSessionJobs("test-session-2")
    spillManager.cleanSessionSpill("test-session")
    spillManager.cleanSessionSpill("test-session-2")
  })

  // 等待任务进入终态。
  const waitForSettled = async (jobId: string): Promise<void> => {
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const snapshot = registry.getJob(jobId)
      if (snapshot && snapshot.status !== "running" && snapshot.status !== "stopping") return
      await sleep(25)
    }
    throw new Error(`Job ${jobId} did not settle in time`)
  }

  // 等待完整输出达到预期长度（Spill 落盘存在异步刷盘）。
  const waitForFullOutput = async (jobId: string, expectedChars: number): Promise<string> => {
    const deadline = Date.now() + 15_000
    let text = ""
    while (Date.now() < deadline) {
      text = registry.getFullOutput(jobId) ?? ""
      if (text.length >= expectedChars) return text
      await sleep(25)
    }
    return text
  }

  it("能够启动后台任务并生成顺序 ID 与快照", async () => {
    const startedEvents: any[] = []
    registry.onJobEvent((e) => {
      if (e.type === "job_started") startedEvents.push(e.job)
    })

    const job1 = registry.startJob({
      kind: "bash",
      command: "echo 'hello world'",
      cwd: process.cwd(),
      sessionId: "test-session",
      label: "echo hello",
    })

    expect(job1.id).toBe("bash-1")
    expect(job1.kind).toBe("bash")
    expect(job1.label).toBe("echo hello")
    expect(job1.status).toBe("running")
    expect(startedEvents).toHaveLength(1)
    expect(startedEvents[0].id).toBe("bash-1")

    const job2 = registry.startJob({
      kind: "bash",
      command: "echo 'second'",
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    expect(job2.id).toBe("bash-2")
  })

  it("限制单会话最大并发后台任务数 (10个)", () => {
    for (let i = 1; i <= 10; i++) {
      registry.startJob({
        kind: "bash",
        command: "sleep 10",
        cwd: process.cwd(),
        sessionId: "test-session",
      })
    }

    expect(() => {
      registry.startJob({
        kind: "bash",
        command: "sleep 10",
        cwd: process.cwd(),
        sessionId: "test-session",
      })
    }).toThrow(/concurrency limit reached/)
  })

  it("消费式读取增量输出 (Consuming Delta Read)", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: "echo 'line 1'; sleep 0.1; echo 'line 2'",
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    // 等待输出产生
    await new Promise((r) => setTimeout(r, 300))

    const read1 = await registry.readOutput(job.id, false, undefined, "test-session")
    expect(read1).not.toBeNull()
    expect(read1?.text).toContain("line 1")

    // 第二次读取不重复前一次读取过的文本
    const read2 = await registry.readOutput(job.id, false, undefined, "test-session")
    expect(read2).not.toBeNull()
    if (read2?.text) {
      expect(read2.text).not.toContain("line 1")
    }
  })

  it("终止任务 (killJob) 能正确转换状态为 stopping/killed", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: "sleep 30",
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    expect(job.status).toBe("running")

    const killRes = await registry.killJob(job.id, "用户手动停止", "test-session")
    expect(killRes.ok).toBe(true)
    expect(killRes.status).toBe("stopping")

    const current = registry.getJob(job.id)
    expect(current?.status === "stopping" || current?.status === "killed").toBe(true)
  })

  it("会话销毁 (cleanSessionJobs) 级联终止所有存活子进程并清空注册表", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: "sleep 30",
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    expect(registry.listJobs("test-session")).toHaveLength(1)

    registry.cleanSessionJobs("test-session")
    expect(registry.listJobs("test-session")).toHaveLength(0)
    expect(registry.getJob(job.id)).toBeUndefined()
  })

  it("跨会话访问隔离保护", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: "echo 1",
      cwd: process.cwd(),
      sessionId: "test-session-1",
    })

    await expect(registry.readOutput(job.id, false, undefined, "test-session-2")).rejects.toThrow(
      /Cross-session access to background job denied/,
    )

    const killRes = await registry.killJob(job.id, "reason", "test-session-2")
    expect(killRes.ok).toBe(false)
    expect(killRes.error).toMatch(/Cross-session (?:kill|termination) of background job denied/)
  })

  it("长输出触发 Spill 后内存缓冲被裁剪且完整输出仍可读", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: `"${process.execPath}" -e "process.stdout.write('a'.repeat(${LARGE_OUTPUT_BYTES}))"`,
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    await waitForSettled(job.id)
    const full = await waitForFullOutput(job.id, LARGE_OUTPUT_BYTES)

    // 内存缓冲只保留尾部窗口，其余字符已被淘汰
    const stats = registry.getMemoryBufferStats(job.id)
    expect(stats).not.toBeNull()
    expect(stats?.retainedBytes).toBeLessThanOrEqual(MAX_MEMORY_BUFFER_BYTES)
    expect(stats?.droppedChars).toBeGreaterThan(0)

    // Spill 文件保留完整内容
    expect(full).toHaveLength(LARGE_OUTPUT_BYTES)

    // 游标落后于裁剪边界时从 Spill 补齐：完整返回且只返回一次
    const first = await registry.readOutput(job.id, false, undefined, "test-session")
    expect(first?.text).toHaveLength(LARGE_OUTPUT_BYTES)
    const second = await registry.readOutput(job.id, false, undefined, "test-session")
    expect(second?.text).toBe("")
  })

  it("裁剪边界后继续输出时增量读取不丢不重", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: `"${process.execPath}" -e "process.stdout.write('a'.repeat(${LARGE_OUTPUT_BYTES})); setTimeout(() => process.stdout.write('${TAIL_MARKER}'), 200)"`,
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    // 分段累积消费首段大输出（可能因管道分片跨多次读取）
    let head = ""
    const headDeadline = Date.now() + 10_000
    while (head.length < LARGE_OUTPUT_BYTES && Date.now() < headDeadline) {
      const res = await registry.readOutput(job.id, true, 1000, "test-session")
      head += res?.text ?? ""
    }
    expect(head.length).toBeGreaterThanOrEqual(LARGE_OUTPUT_BYTES)

    await waitForSettled(job.id)
    const full = await waitForFullOutput(job.id, LARGE_OUTPUT_BYTES + TAIL_MARKER.length)
    expect(full).toBe(`${"a".repeat(LARGE_OUTPUT_BYTES)}${TAIL_MARKER}`)

    const rest = await registry.readOutput(job.id, false, undefined, "test-session")
    expect(`${head}${rest?.text ?? ""}`).toBe(full)

    const extra = await registry.readOutput(job.id, false, undefined, "test-session")
    expect(extra?.text).toBe("")
  })

  it("readOutput(wait) 在新输出到达时被唤醒", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: "sleep 0.3; echo 'wake-up'",
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    let text = ""
    const deadline = Date.now() + 5000
    while (!text.includes("wake-up") && Date.now() < deadline) {
      const res = await registry.readOutput(job.id, true, 1000, "test-session")
      text += res?.text ?? ""
    }
    expect(text).toContain("wake-up")
  })

  it("readOutput(wait) 在任务结束且无新输出时被唤醒", async () => {
    const job = registry.startJob({
      kind: "bash",
      command: "sleep 0.3",
      cwd: process.cwd(),
      sessionId: "test-session",
    })

    const startedAt = Date.now()
    const res = await registry.readOutput(job.id, true, 5000, "test-session")
    expect(res?.text).toBe("")
    expect(res?.job.status).toBe("completed")
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(150)
  })
})
