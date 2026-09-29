import { ChevronDown, ExternalLink, FileCode, FileDiff, Loader2, RotateCcw } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import {
  agentFileRevertStore,
  useAgentFileReverts,
} from "@/features/agent/hooks/agentFileRevertStore"
import type {
  FileChangeItem,
  FileChangeRevertTarget,
  FileChangeSummary,
} from "@/features/agent/utils/fileChanges"
import { useTranslation } from "@/i18n"

export interface FileChangesCardProps {
  summary: FileChangeSummary
  // 回退上下文（sessionId + 该轮用户消息时间戳）；缺省时不提供回退按钮。
  revertTarget?: FileChangeRevertTarget
  className?: string
}

/**
 * FileChangesCard - AI 回复的文件修改统计卡片。
 * 折叠态展示文件数与增删行总数；展开后逐文件列出路径与增删行：
 * 点击文件在编辑器打开并定位首个变更行；提供回退能力时行尾展示回退按钮（二次确认）。
 */
export const FileChangesCard = ({
  summary,
  revertTarget,
  className = "",
}: FileChangesCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { success, warning } = useLxAgentToast()
  const [isExpanded, setIsExpanded] = useState(false)
  const [revertingPath, setRevertingPath] = useState<string | null>(null)
  const fileCount = summary.files.length

  // 本轮已回退标记（按 (轮次, 文件) 匹配展示；卡片与服务端同源，刷新后仍可见）。
  const marks = useAgentFileReverts(revertTarget?.sessionId)
  const turnMarks = marks.filter(
    (mark) => mark.userMessageTimestamp === revertTarget?.userMessageTimestamp,
  )
  const revertedAtOf = (path: string): number | undefined =>
    turnMarks.find((mark) => path === mark.file || path.endsWith(`/${mark.file}`))?.revertedAt

  // 回退单个文件到该轮修改前的快照状态。
  const handleRevert = async (file: FileChangeItem): Promise<void> => {
    if (!revertTarget || revertingPath !== null) return
    setRevertingPath(file.filePath)
    try {
      const result = await agentApi.revertFileChange(
        revertTarget.sessionId,
        revertTarget.userMessageTimestamp,
        file.filePath,
      )
      if (result.ok) {
        // 记录回退标记：文件名置灰与 flowlist 回退 item 实时联动。
        agentFileRevertStore.addMarks(revertTarget.sessionId, [
          {
            userMessageTimestamp: revertTarget.userMessageTimestamp,
            file: result.file,
            revertedAt: result.revertedAt,
          },
        ])
        success(t("agent.revertFileSuccess", { file: file.filePath }))
      } else {
        warning(t("agent.revertFileFailed"))
      }
    } catch {
      warning(t("agent.revertFileFailed"))
    } finally {
      setRevertingPath(null)
    }
  }

  return (
    <div
      data-testid="file-changes-card"
      className={`agent-file-changes w-full min-w-0 ${className}`}
    >
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((previous) => !previous)}
        className="agent-file-changes-header flex w-full items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white/85 focus:outline-none"
      >
        <FileDiff className="agent-file-changes-icon h-3.5 w-3.5 shrink-0 text-emerald-400/90" />
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
        {turnMarks.length > 0 && (
          <span className="agent-file-changes-reverted-count shrink-0 text-amber-400/90">
            {t("agent.fileRevertedCount", { count: turnMarks.length })}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-white/35 transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          } ml-auto`}
        />
      </button>
      {isExpanded && (
        <div className="agent-file-changes-list mt-1 flex w-full flex-col gap-0.5 rounded-[6px] border border-[var(--color-theme-border,rgba(255,255,255,0.08))] bg-black/20 p-1">
          {summary.files.map((file) => {
            const revertedAt = revertedAtOf(file.filePath)
            return (
              // 文件行为叶子级导航行（level 3）：行点击不打开，行尾图标按钮打开文件并定位首个变更行。
              <LxNavItem
                key={file.filePath}
                level={3}
                size="small"
                className="agent-file-changes-item"
                prefix={
                  <FileCode className="agent-file-changes-file-icon h-3.5 w-3.5 shrink-0 text-white/35" />
                }
                label={file.filePath}
                labelClassName={`agent-file-changes-path font-mono ${
                  revertedAt !== undefined ? "text-white/35 line-through" : "text-white/70"
                }`}
                suffix={
                  <>
                    {revertedAt !== undefined && (
                      <LxTooltip
                        placement="top"
                        content={t("agent.fileRevertedAt", {
                          time: new Date(revertedAt).toLocaleString(),
                        })}
                      >
                        <span className="agent-file-changes-reverted-tag shrink-0 rounded-[4px] bg-amber-400/15 px-1 text-amber-300/90">
                          {t("agent.fileReverted")}
                        </span>
                      </LxTooltip>
                    )}
                    <span className="agent-file-changes-item-added shrink-0 font-mono text-emerald-400/90">
                      +{file.added}
                    </span>
                    <span className="agent-file-changes-item-removed shrink-0 font-mono text-rose-400/90">
                      −{file.removed}
                    </span>
                    <LxIconButton
                      size="small"
                      aria-label={t("agent.openFile")}
                      title={{ content: t("agent.openFile"), placement: "top" }}
                      className="agent-file-changes-open"
                      disabled={revertedAt !== undefined}
                      onClick={() => void agentApi.openFileAt(file.filePath, file.line)}
                    >
                      <ExternalLink />
                    </LxIconButton>
                    {revertTarget && (
                      <LxTooltip
                        trigger="both"
                        placement="top"
                        content={
                          revertedAt !== undefined
                            ? t("agent.fileRevertedAt", {
                                time: new Date(revertedAt).toLocaleString(),
                              })
                            : t("agent.revertFile")
                        }
                        click={{
                          content: t("agent.revertFileConfirm", { file: file.filePath }),
                          placement: "top",
                        }}
                        onConfirm={() => void handleRevert(file)}
                      >
                        {/* 包裹 span 承接 hover：禁用态按钮自身不再派发鼠标事件。 */}
                        <span className="agent-file-changes-revert-trigger inline-flex shrink-0">
                          <LxIconButton
                            size="small"
                            aria-label={t("agent.revertFile")}
                            disabled={revertingPath !== null || revertedAt !== undefined}
                            className="agent-file-changes-revert"
                          >
                            {revertingPath === file.filePath ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <RotateCcw />
                            )}
                          </LxIconButton>
                        </span>
                      </LxTooltip>
                    )}
                  </>
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
