import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { LocalJobRegistry } from "@/agent/jobs/jobRegistry"

describe("LocalJobRegistry", () => {
  let registry: LocalJobRegistry

  beforeEach(() => {
    registry = new LocalJobRegistry()
  })

  afterEach(() => {
    registry.cleanSessionJobs("test-session")
    registry.cleanSessionJobs("test-session-2")
  })

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
    }).toThrow("当前会话后台任务并发超限")
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

    await expect(
      registry.readOutput(job.id, false, undefined, "test-session-2"),
    ).rejects.toThrow("拒绝跨会话访问后台任务")

    const killRes = await registry.killJob(job.id, "reason", "test-session-2")
    expect(killRes.ok).toBe(false)
    expect(killRes.error).toContain("拒绝跨会话终止后台任务")
  })
})
