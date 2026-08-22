import { z } from "zod"
import type { AgentTool } from "../core/types"
import { jobRegistry } from "../jobs/jobRegistry"
import type { SessionDeps } from "./read"

const jobOutputSchema = z.object({
  job_id: z.string().describe("后台任务 ID，如 'bash-1'"),
  wait: z
    .boolean()
    .describe("是否在无新输出时阻塞等待新日志或任务结束（可选，默认 false 非阻塞）")
    .optional(),
  timeout_ms: z.number().describe("等待最大毫秒数（默认 10000ms，上限 60000ms）").optional(),
})

const jobListSchema = z.object({})

const jobKillSchema = z.object({
  job_id: z.string().describe("要终止的后台任务 ID，如 'bash-1'"),
  reason: z.string().describe("终止原因（可选）").optional(),
})

const formatDuration = (startedAt: number, finishedAt?: number): string => {
  const end = finishedAt ?? Date.now()
  const sec = Math.max(0, Math.round((end - startedAt) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return `${min}m ${remSec}s`
}

/**
 * 创建 job_output 工具：消费式读取后台任务的增量日志。
 */
export const createJobOutputTool = (
  sessionDeps?: SessionDeps,
): AgentTool<typeof jobOutputSchema> => ({
  name: "job_output",
  label: "读取后台任务输出",
  description:
    "消费式读取后台任务自上次读取以来的新增日志输出。支持 wait 等待新输出或等待进程退出。每个响应末尾附带当前任务状态 [status: ...]。",
  inputSchema: jobOutputSchema,
  execute: async (_toolCallId, params) => {
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const res = await jobRegistry.readOutput(
      params.job_id,
      params.wait,
      params.timeout_ms,
      sessionId,
    )
    if (!res) {
      return {
        content: [{ type: "text", text: `未找到任务 ${params.job_id}，请检查任务 ID 是否正确。` }],
        details: { error: "job_not_found" },
      }
    }

    const textPart = res.text.trim() ? res.text : "(无新增输出)"
    const detailPart = res.job.detail ? ` - ${res.job.detail}` : ""
    const statusPart = `[status: ${res.job.status}${detailPart}]`
    const finalText = `${textPart}\n\n${statusPart}`

    return {
      content: [{ type: "text", text: finalText }],
      details: { job: res.job },
    }
  },
})

/**
 * 创建 job_list 工具：列出当前会话中所有的后台任务。
 */
export const createJobListTool = (sessionDeps?: SessionDeps): AgentTool<typeof jobListSchema> => ({
  name: "job_list",
  label: "列出后台任务",
  description: "列出当前会话中所有的后台长任务、运行状态、PID 与执行耗时。",
  inputSchema: jobListSchema,
  execute: async () => {
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const jobs = jobRegistry.listJobs(sessionId)
    if (jobs.length === 0) {
      return {
        content: [{ type: "text", text: "(当前会话无后台任务)" }],
        details: { jobs: [] },
      }
    }

    const lines = jobs.map((j) => {
      const duration = formatDuration(j.startedAt, j.finishedAt)
      const detail = j.detail ? ` (${j.detail})` : ""
      return `- ${j.id} [${j.status}] PID: ${j.pid ?? "N/A"} — ${j.label}${detail} (已运行 ${duration})`
    })

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      details: { jobs },
    }
  },
})

/**
 * 创建 job_kill 工具：终止指定的后台任务进程树。
 */
export const createJobKillTool = (sessionDeps?: SessionDeps): AgentTool<typeof jobKillSchema> => ({
  name: "job_kill",
  label: "终止后台任务",
  description: "向后台长任务的进程树发送终止信号，安全关闭长耗时进程。",
  inputSchema: jobKillSchema,
  execute: async (_toolCallId, params) => {
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const res = await jobRegistry.killJob(params.job_id, params.reason, sessionId)
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `终止任务失败: ${res.error}` }],
        details: { error: res.error },
      }
    }

    const job = jobRegistry.getJob(params.job_id)
    return {
      content: [
        {
          type: "text",
          text: `已请求终止任务 ${params.job_id}${params.reason ? ` (原因: ${params.reason})` : ""}，当前状态: ${job?.status ?? "stopping"}。`,
        },
      ],
      details: { job },
    }
  },
})
