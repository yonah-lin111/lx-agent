import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { jobRegistry } from "@/agent/jobs/jobRegistry"
import { createBashTool } from "@/agent/tools/bash"
import { createJobKillTool, createJobListTool, createJobOutputTool } from "@/agent/tools/jobTools"

describe("Job Tools and Bash Background Execution", () => {
  const sessionId = "test-session-tools"
  const sessionDeps = { getSessionId: () => sessionId }

  beforeEach(() => {
    jobRegistry.cleanSessionJobs(sessionId)
  })

  afterEach(() => {
    jobRegistry.cleanSessionJobs(sessionId)
  })

  it("bash 工具支持 background: true 返回任务 ID 与指引", async () => {
    const bashTool = createBashTool(process.cwd(), sessionDeps)

    const result = await bashTool.execute("call-1", {
      command: "echo 'hello background'",
      background: true,
    })

    const text = (result.content[0] as { type: "text"; text: string }).text
    expect(text).toContain("Background job bash-1")
    expect(text).toContain("job_output")
    expect((result.details as any)?.backgroundJobId).toBe("bash-1")
  })

  it("job_list 工具列出当前会话的后台任务", async () => {
    const listTool = createJobListTool(sessionDeps)

    // 初始无任务
    const res1 = await listTool.execute("call-list-1", {})
    expect((res1.content[0] as any).text).toBe("(当前会话无后台任务)")

    // 启动任务后列出
    jobRegistry.startJob({
      kind: "bash",
      command: "sleep 10",
      cwd: process.cwd(),
      sessionId,
      label: "my-long-job",
    })

    const res2 = await listTool.execute("call-list-2", {})
    const text2 = (res2.content[0] as any).text
    expect(text2).toContain("bash-1")
    expect(text2).toContain("my-long-job")
    expect((res2.details as any)?.jobs).toHaveLength(1)
  })

  it("job_output 工具消费式读取并携带 status 后缀", async () => {
    const job = jobRegistry.startJob({
      kind: "bash",
      command: "echo 'output message'",
      cwd: process.cwd(),
      sessionId,
    })

    await new Promise((r) => setTimeout(r, 200))

    const outputTool = createJobOutputTool(sessionDeps)
    const res = await outputTool.execute("call-out-1", {
      job_id: job.id,
    })

    const text = (res.content[0] as any).text
    expect(text).toContain("output message")
    expect(text).toContain("[status:")
    expect((res.details as any)?.job).toBeDefined()
  })

  it("job_kill 工具终止目标任务", async () => {
    const job = jobRegistry.startJob({
      kind: "bash",
      command: "sleep 30",
      cwd: process.cwd(),
      sessionId,
    })

    const killTool = createJobKillTool(sessionDeps)
    const res = await killTool.execute("call-kill-1", {
      job_id: job.id,
      reason: "不需要了",
    })

    const text = (res.content[0] as any).text
    expect(text).toContain(`已请求终止任务 ${job.id}`)
    expect(text).toContain("原因: 不需要了")
  })
})
