import type { JobSnapshot } from "@shared/contracts/agent"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { agentApi } from "../api/agentApi"
import { sessionListStore } from "./sessionListStore"

export interface UseAgentJobsResult {
  jobs: JobSnapshot[]
  runningJobs: JobSnapshot[]
  settledJobs: JobSnapshot[]
  selectedJob: JobSnapshot | null
  selectedJobId: string | null
  jobLogs: Record<string, string>
  selectJob: (jobId: string) => void
  killJob: (jobId: string, reason?: string) => Promise<void>
  removeJob: (jobId: string) => Promise<void>
  clearSettledJobs: () => Promise<void>
  refreshJobs: () => Promise<void>
}

/**
 * 后台长任务管理 Hook（严格按当前活动 SessionId 进行数据隔离与事件订阅）。
 */
export const useAgentJobs = (sessionIdOverride?: string | null): UseAgentJobsResult => {
  const storeSessionId = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getCurrentSessionId,
  )
  const currentSessionId = sessionIdOverride !== undefined ? sessionIdOverride : storeSessionId

  const [jobs, setJobs] = useState<JobSnapshot[]>([])
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [jobLogs, setJobLogs] = useState<Record<string, string>>({})

  const selectJob = useCallback(async (jobId: string) => {
    setSelectedJobId(jobId)
    try {
      const res = await agentApi.readJobOutput(jobId)
      if (res && typeof res.text === "string") {
        setJobLogs((prev) => ({
          ...prev,
          [jobId]: res.text,
        }))
      }
    } catch {
      // 忽略
    }
  }, [])

  const refreshJobs = useCallback(async () => {
    if (!currentSessionId) {
      setJobs([])
      setSelectedJobId(null)
      return
    }
    try {
      const list = await agentApi.listJobs(currentSessionId)
      setJobs(list)
      const targetId = list.find((j) => j.id === selectedJobId)?.id ?? list[0]?.id ?? null
      if (targetId) {
        void selectJob(targetId)
      } else {
        setSelectedJobId(null)
      }
    } catch {
      // 忽略
    }
  }, [currentSessionId, selectedJobId, selectJob])

  // 会话切换时刷新任务并重置状态
  useEffect(() => {
    setJobLogs({})
    void refreshJobs()
  }, [refreshJobs])

  // 监听来自 main 进程的实时任务事件，严格限定于当前会话
  useEffect(() => {
    if (!currentSessionId) return

    const unsubscribe = agentApi.onEvent((event) => {
      if (event.type === "job_started") {
        if (event.job.sessionId !== currentSessionId) return
        setJobs((prev) => {
          const exists = prev.some((j) => j.id === event.job.id)
          if (exists) {
            return prev.map((j) => (j.id === event.job.id ? event.job : j))
          }
          return [...prev, event.job]
        })
        setSelectedJobId((current) => current ?? event.job.id)
      } else if (event.type === "job_output_chunk") {
        setJobLogs((prev) => ({
          ...prev,
          [event.jobId]: (prev[event.jobId] ?? "") + event.chunk,
        }))
      } else if (event.type === "job_settled") {
        if (event.job.sessionId !== currentSessionId) return
        setJobs((prev) => prev.map((j) => (j.id === event.job.id ? event.job : j)))
      }
    })
    return () => unsubscribe()
  }, [currentSessionId])

  const killJob = useCallback(
    async (jobId: string, reason?: string) => {
      try {
        await agentApi.killJob(jobId, reason)
        await refreshJobs()
      } catch {
        // 忽略
      }
    },
    [refreshJobs],
  )

  const removeJob = useCallback(
    async (jobId: string) => {
      try {
        await agentApi.removeJob(jobId)
        setJobs((prev) => {
          const next = prev.filter((j) => j.id !== jobId)
          setSelectedJobId((curr) => {
            if (curr !== jobId) return curr
            return next[0]?.id ?? null
          })
          return next
        })
        setJobLogs((prev) => {
          const next = { ...prev }
          delete next[jobId]
          return next
        })
      } catch {
        // 忽略
      }
    },
    [],
  )

  const clearSettledJobs = useCallback(async () => {
    if (!currentSessionId) return
    try {
      await agentApi.clearSettledJobs(currentSessionId)
      await refreshJobs()
    } catch {
      // 忽略
    }
  }, [currentSessionId, refreshJobs])

  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "stopping")
  const settledJobs = jobs.filter(
    (j) => j.status === "completed" || j.status === "failed" || j.status === "killed",
  )
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? (jobs[0] ?? null)

  return {
    jobs,
    runningJobs,
    settledJobs,
    selectedJob,
    selectedJobId,
    jobLogs,
    selectJob,
    killJob,
    removeJob,
    clearSettledJobs,
    refreshJobs,
  }
}
