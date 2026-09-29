import { ChevronDown, ExternalLink, FileCode, FileDiff } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import type { FileChangeSummary } from "@/features/agent/utils/fileChanges"
import { useTranslation } from "@/i18n"

export interface FileChangesCardProps {
  summary: FileChangeSummary
  className?: string
}

/**
 * FileChangesCard - AI 回复底部的文件修改统计卡片。
 * 折叠态展示文件数与增删行总数；展开后逐文件列出路径与增删行，
 * 点击文件在编辑器打开并定位首个变更行。
 */
export const FileChangesCard = ({
  summary,
  className = "",
}: FileChangesCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const fileCount = summary.files.length

  return (
    <div data-testid="file-changes-card" className={`agent-file-changes min-w-0 ${className}`}>
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((previous) => !previous)}
        className="agent-file-changes-header flex w-fit max-w-full items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white/85 focus:outline-none"
      >
        <FileDiff className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" />
        <span className="agent-file-changes-count shrink-0">
          {fileCount === 1
            ? t("agent.filesChangedSingular")
            : t("agent.filesChangedPlural", { count: fileCount })}
        </span>
        <span className="agent-file-changes-total-added shrink-0 font-mono text-emerald-400">
          +{summary.totalAdded}
        </span>
        <span className="agent-file-changes-total-removed shrink-0 font-mono text-rose-400">
          −{summary.totalRemoved}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/35 transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
      </button>
      {isExpanded && (
        <div className="agent-file-changes-list mt-1 flex flex-col gap-0.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.08))] bg-black/20 p-1">
          {summary.files.map((file) => (
            <LxTooltip key={file.filePath} placement="top" content={file.filePath}>
              <button
                type="button"
                aria-label={t("agent.openFile")}
                onClick={() => void agentApi.openFileAt(file.filePath, file.line)}
                className="agent-file-changes-item group flex w-full min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 py-1 text-xs transition-colors hover:bg-white/10 focus:outline-none"
              >
                <FileCode className="h-3 w-3 shrink-0 text-white/35" />
                <span className="min-w-0 flex-1 truncate text-left font-mono text-white/70">
                  {file.filePath}
                </span>
                <span className="agent-file-changes-item-added shrink-0 font-mono text-emerald-400/90">
                  +{file.added}
                </span>
                <span className="agent-file-changes-item-removed shrink-0 font-mono text-rose-400/90">
                  −{file.removed}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-white/25 transition-colors group-hover:text-white/60" />
              </button>
            </LxTooltip>
          ))}
        </div>
      )}
    </div>
  )
}
