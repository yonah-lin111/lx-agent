import { z } from "zod"
import type { AgentTool } from "../core/types"
import { jobRegistry } from "../jobs/jobRegistry"
import type { SessionDeps } from "./read"

const jobOutputSchema = z.object({
  job_id: z.string().describe("Background job ID, e.g. 'bash-1'"),
  wait: z
    .boolean()
    .describe(
      "Whether to block and wait for new log output or job completion when no new output is available (optional, default false non-blocking)",
    )
    .optional(),
  timeout_ms: z
    .number()
    .describe("Maximum milliseconds to wait (default 10000ms, max 60000ms)")
    .optional(),
})

const jobListSchema = z.object({})

const jobKillSchema = z.object({
  job_id: z.string().describe("Background job ID to terminate, e.g. 'bash-1'"),
  reason: z.string().describe("Termination reason (optional)").optional(),
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
  label: "Read job output",
  description:
    "Consumptively read new log output from a background job since last read. Supports 'wait' to block for new output or process exit. Current status [status: ...] is appended to response.",
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
        content: [
          { type: "text", text: `Job ${params.job_id} not found. Please verify the job ID.` },
        ],
        details: { error: "job_not_found" },
      }
    }

    const textPart = res.text.trim() ? res.text : "(No new output)"
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
  label: "List jobs",
  description:
    "List all background jobs, statuses, PIDs, and run durations in the current session.",
  inputSchema: jobListSchema,
  execute: async () => {
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const jobs = jobRegistry.listJobs(sessionId)
    if (jobs.length === 0) {
      return {
        content: [{ type: "text", text: "(No background jobs in current session)" }],
        details: { jobs: [] },
      }
    }

    const lines = jobs.map((j) => {
      const duration = formatDuration(j.startedAt, j.finishedAt)
      const detail = j.detail ? ` (${j.detail})` : ""
      return `- ${j.id} [${j.status}] PID: ${j.pid ?? "N/A"} — ${j.label}${detail} (running for ${duration})`
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
  label: "Kill job",
  description:
    "Send termination signal to the process tree of a background job to cleanly shut down long-running processes.",
  inputSchema: jobKillSchema,
  execute: async (_toolCallId, params) => {
    const sessionId = sessionDeps?.getSessionId?.() ?? undefined
    const res = await jobRegistry.killJob(params.job_id, params.reason, sessionId)
    if (!res.ok) {
      return {
        content: [{ type: "text", text: `Failed to terminate job: ${res.error}` }],
        details: { error: res.error },
      }
    }

    const job = jobRegistry.getJob(params.job_id)
    return {
      content: [
        {
          type: "text",
          text: `Termination requested for job ${params.job_id}${params.reason ? ` (reason: ${params.reason})` : ""}, current status: ${job?.status ?? "stopping"}.`,
        },
      ],
      details: { job },
    }
  },
})
