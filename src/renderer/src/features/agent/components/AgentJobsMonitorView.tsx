import type { JobSnapshot } from "@shared/contracts/agent"
import {
  Activity,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  OctagonX,
  RefreshCw,
  Terminal as TerminalIcon,
  Trash2,
  X,
  XCircle,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useAgentJobs } from "../hooks/useAgentJobs"

interface AgentJobsMonitorViewProps {
  isExpanded: boolean
  rightActions?: React.ReactNode
}

const formatDuration = (startedAt: number, finishedAt?: number): string => {
  const end = finishedAt ?? Date.now()
  const sec = Math.max(0, Math.round((end - startedAt) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  return `${min}m ${remSec}s`
}

const JobStatusDot = ({ status }: { status: JobSnapshot["status"] }): React.JSX.Element => {
  if (status === "running" || status === "stopping") {
    return <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-400" />
  }
  if (status === "completed") {
    return <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
  }
  if (status === "failed") {
    return <XCircle className="h-3 w-3 shrink-0 text-red-400" />
  }
  return <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-500" />
}

export const AgentJobsMonitorView = ({
  rightActions,
}: AgentJobsMonitorViewProps): React.JSX.Element => {
  const {
    jobs,
    settledJobs,
    selectedJob,
    selectedJobId,
    jobLogs,
    selectJob,
    killJob,
    removeJob,
    clearSettledJobs,
    refreshJobs,
  } = useAgentJobs()
  const storeSelectedJobId = useBottomSideBarStore((state) => state.selectedJobId)

  const { success: successToast } = useLxToast()
  const [copied, setCopied] = useState(false)
  const [isKilling, setIsKilling] = useState(false)
  const [pendingCloseJobId, setPendingCloseJobId] = useState<string | null>(null)
  const logContainerRef = useRef<HTMLDivElement>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // 当外部 store 指定了 selectedJobId 时自动选中
  useEffect(() => {
    if (storeSelectedJobId && storeSelectedJobId !== selectedJobId) {
      selectJob(storeSelectedJobId)
    }
  }, [storeSelectedJobId, selectedJobId, selectJob])

  const activeJob = selectedJob ?? jobs[0] ?? null
  const currentLogs = activeJob ? jobLogs[activeJob.id] || "" : ""

  // 日志流增量更新时自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [currentLogs])

  // 水平 Tab 滚动状态监测与滚轮支持（对齐 TerminalTabs）
  const updateScrollState = useCallback((): void => {
    const el = scrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 1)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    updateScrollState()

    const onScroll = (): void => updateScrollState()
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })

    const observer = new ResizeObserver(() => updateScrollState())
    observer.observe(el)

    return () => {
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      observer.disconnect()
    }
  }, [jobs, updateScrollState])

  const handleScroll = useCallback((direction: "left" | "right"): void => {
    const el = scrollRef.current
    if (!el) return
    const scrollAmount = direction === "left" ? -150 : 150
    el.scrollBy({ left: scrollAmount, behavior: "smooth" })
  }, [])

  const handleCopyLogs = async (): Promise<void> => {
    if (!currentLogs) return
    try {
      await navigator.clipboard.writeText(currentLogs)
      setCopied(true)
      successToast("Logs copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略
    }
  }

  const handleKillJob = async (): Promise<void> => {
    if (!activeJob) return
    setIsKilling(true)
    try {
      await killJob(activeJob.id, "User requested cancellation")
      successToast(`Cancellation signal sent to job ${activeJob.id}`)
    } finally {
      setIsKilling(false)
    }
  }

  const handleClearSettled = async (): Promise<void> => {
    const count = settledJobs.length
    if (count === 0) return
    await clearSettledJobs()
    successToast(`Cleared ${count} finished jobs`)
  }

  return (
    <div className="agent-jobs-monitor-view flex h-full w-full flex-col overflow-hidden bg-[#212121]">
      {/* 顶部标签与操作栏（高度 32px，与 TerminalTabs 风格统一，支持滚轮与左右箭头切换） */}
      <div className="flex h-8 shrink-0 items-center justify-between gap-1 overflow-hidden px-1 select-none">
        {/* 最左侧：Jobs 图标 */}
        <div className="flex shrink-0 items-center justify-center px-1 text-sky-400">
          <Activity className="h-3.5 w-3.5" />
        </div>

        {/* 向左滚动按钮 */}
        <LxIconButton
          aria-label="Scroll left"
          disabled={!canScrollLeft}
          size="small"
          onClick={() => handleScroll("left")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </LxIconButton>

        {/* 中间：可滚动的任务 Tab 列表 */}
        <div
          ref={scrollRef}
          className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
        >
          {jobs.length === 0 ? (
            <div className="flex items-center gap-1.5 text-[11px] text-white/35 pl-1">
              <Activity className="h-3.5 w-3.5 text-white/20" />
              <span>(No background jobs in this session)</span>
            </div>
          ) : (
            jobs.map((job) => {
              const isSelected = job.id === activeJob?.id
              const isConfirming = pendingCloseJobId === job.id
              const isRunning = job.status === "running" || job.status === "stopping"
              const confirmContent = isRunning
                ? "Job is running. Closing will terminate the process (SIGTERM). Continue?"
                : "Close tab"

              return (
                <div
                  key={job.id}
                  className={`group relative flex max-w-[210px] min-w-[90px] shrink-0 select-none items-center justify-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "border-white/15 bg-white/[0.08] text-white shadow-xs"
                      : "border-white/5 bg-transparent text-white/60 hover:border-white/10 hover:bg-white/[0.04] hover:text-white/90"
                  }`}
                  onClick={() => selectJob(job.id)}
                >
                  <JobStatusDot status={job.status} />
                  <span className="font-mono text-[11px] font-semibold leading-none">{job.id}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-white/50 leading-none">
                    {job.label}
                  </span>
                  <span className="shrink-0 text-[10px] text-white/35 tabular-nums leading-none">
                    {formatDuration(job.startedAt, job.finishedAt)}
                  </span>

                  {/* 关闭 Tab 按钮 */}
                  <div
                    className={`flex shrink-0 items-center transition-opacity ${
                      isSelected || isConfirming
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <LxTooltip
                      closeOnOutsideClick
                      content={confirmContent}
                      open={isConfirming ? true : undefined}
                      placement="top"
                      title={isConfirming ? "Confirm Terminate & Close" : undefined}
                      onCancel={() => setPendingCloseJobId(null)}
                      onConfirm={
                        isConfirming
                          ? () => {
                              void removeJob(job.id)
                              setPendingCloseJobId(null)
                            }
                          : undefined
                      }
                      onOpenChange={(open) => {
                        if (!open && isConfirming) setPendingCloseJobId(null)
                      }}
                    >
                      <button
                        type="button"
                        aria-label="Close tab"
                        className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] text-white/40 hover:bg-white/10 hover:text-white/90 cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isRunning) {
                            setPendingCloseJobId(job.id)
                          } else {
                            void removeJob(job.id)
                          }
                        }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </LxTooltip>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* 向右滚动按钮 */}
        <LxIconButton
          aria-label="Scroll right"
          disabled={!canScrollRight}
          size="small"
          onClick={() => handleScroll("right")}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </LxIconButton>

        {/* 右侧：单任务操作与全局 Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {activeJob && (
            <>
              {(activeJob.status === "running" || activeJob.status === "stopping") && (
                <LxTooltip content="Terminate process (SIGTERM)" placement="top">
                  <button
                    type="button"
                    disabled={isKilling}
                    onClick={() => void handleKillJob()}
                    className="flex h-6 items-center gap-1 rounded-[4px] border border-red-500/30 bg-red-500/15 px-2 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/25 cursor-pointer disabled:opacity-50"
                  >
                    {isKilling ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <OctagonX className="h-3 w-3" />
                    )}
                    <span>Kill</span>
                  </button>
                </LxTooltip>
              )}

              <LxTooltip content="Copy logs" placement="top">
                <LxIconButton
                  aria-label="Copy logs"
                  size="small"
                  onClick={() => void handleCopyLogs()}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </LxIconButton>
              </LxTooltip>

              <LxTooltip content="Refresh list" placement="top">
                <LxIconButton
                  aria-label="Refresh list"
                  size="small"
                  onClick={() => void refreshJobs()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </LxIconButton>
              </LxTooltip>
            </>
          )}

          {settledJobs.length > 0 && (
            <LxTooltip content={`Clear finished jobs (${settledJobs.length})`} placement="top">
              <LxIconButton
                aria-label="Clear finished jobs"
                size="small"
                onClick={() => void handleClearSettled()}
              >
                <Trash2 className="h-3.5 w-3.5 text-white/60 hover:text-white/90" />
              </LxIconButton>
            </LxTooltip>
          )}

          <div className="h-3.5 w-px bg-white/10 mx-0.5" />

          {rightActions}
        </div>
      </div>

      {/* 下方日志视口区（与终端保持一致的独立圆角暗色容器） */}
      <div className="agent-jobs-log-viewport relative flex min-h-0 flex-1 w-full flex-col overflow-hidden rounded-[4px] border border-white/5 bg-[#111116]">
        {activeJob ? (
          <>
            {/* 顶栏元信息 */}
            <div className="agent-jobs-log-header flex h-7 shrink-0 items-center justify-between border-b border-white/5 bg-white/[0.02] px-3 font-mono text-[11px] text-white/50 select-text">
              <div className="min-w-0 flex-1 truncate mr-2">
                <span className="text-sky-400 font-semibold mr-1.5">{activeJob.id}</span>
                <span className="text-white/80">$ {activeJob.label}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[10px] text-white/40">
                <span>PID: {activeJob.pid ?? "N/A"}</span>
                <span>·</span>
                <span
                  className={`capitalize ${
                    activeJob.status === "running"
                      ? "text-sky-300 font-medium"
                      : activeJob.status === "completed"
                        ? "text-emerald-300"
                        : activeJob.status === "failed"
                          ? "text-red-300"
                          : "text-zinc-400"
                  }`}
                >
                  {activeJob.status}
                  {activeJob.detail ? ` (${activeJob.detail})` : ""}
                </span>
                <span>·</span>
                <span>Elapsed {formatDuration(activeJob.startedAt, activeJob.finishedAt)}</span>
              </div>
            </div>

            {/* 终端实时日志流 */}
            <div
              ref={logContainerRef}
              className="agent-jobs-log-content flex-1 overflow-y-auto p-3 font-mono text-[12px] leading-relaxed text-zinc-200 select-text bg-[#0d0d12]"
            >
              {currentLogs ? (
                <pre className="whitespace-pre-wrap break-all font-mono">{currentLogs}</pre>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-white/30 italic">
                  (No log output yet)
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="agent-jobs-empty-state flex h-full w-full flex-col items-center justify-center gap-1.5 text-white/40 select-none">
            <TerminalIcon className="h-8 w-8 text-white/15 mb-1" />
            <span className="text-xs text-white/60">No background jobs in this session</span>
            <span className="text-[11px] text-white/30">
              Tasks started via <code>bash(background: true)</code> will be monitored here in
              real-time.
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
