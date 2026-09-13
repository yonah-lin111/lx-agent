import type { JobSnapshot } from "@shared/contracts/agent"
import { Loader2, Terminal } from "lucide-react"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

interface JobStatusButtonProps {
  jobs: JobSnapshot[]
  onOpenJobs?: () => void
}

export const JobStatusButton = ({
  jobs,
  onOpenJobs,
}: JobStatusButtonProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  if (!jobs || jobs.length === 0) return null

  const runningJobs = jobs.filter((j) => j.status === "running" || j.status === "stopping")
  const runningCount = runningJobs.length

  const handleClick = (): void => {
    if (onOpenJobs) {
      onOpenJobs()
    } else {
      useBottomSideBarStore.getState().openJobsMonitor()
    }
  }

  const tooltipContent = (
    <div className="flex min-w-[160px] max-w-[260px] flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-white/50">
        {runningCount > 0
          ? t("agent.backgroundJobsCount", { running: runningCount, total: jobs.length })
          : t("agent.backgroundJobsTotal", { count: jobs.length })}
      </span>
      {jobs.slice(0, 5).map((job) => (
        <div key={job.id} className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-white/80 font-mono">{job.id}</span>
          <span
            className={`shrink-0 rounded px-1 text-[10px] ${
              job.status === "running"
                ? "bg-sky-500/20 text-sky-300"
                : job.status === "completed"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : job.status === "failed"
                    ? "bg-red-500/20 text-red-300"
                    : "bg-zinc-500/20 text-zinc-400"
            }`}
          >
            {job.status}
          </span>
        </div>
      ))}
      {jobs.length > 5 && (
        <span className="text-[10px] text-white/40">
          {t("agent.moreJobsClickToView", { count: jobs.length })}
        </span>
      )}
    </div>
  )

  return (
    <LxTooltip content={tooltipContent} placement="top">
      <LxIconButton
        aria-label={t("agent.jobStatus")}
        onClick={handleClick}
        iconOnly={false}
        textClass={runningCount > 0 ? "text-sky-300" : "text-white/50"}
        className={`shrink-0 px-1.5 py-0.5 text-xs ${
          runningCount > 0 ? "bg-sky-500/10 font-medium" : ""
        }`}
        icon={
          runningCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-sky-400" />
          ) : (
            <Terminal className="h-3.5 w-3.5 shrink-0" />
          )
        }
      >
        <span className="tabular-nums font-mono">
          {runningCount > 0 ? `${runningCount} running` : `${jobs.length} jobs`}
        </span>
      </LxIconButton>
    </LxTooltip>
  )
}
