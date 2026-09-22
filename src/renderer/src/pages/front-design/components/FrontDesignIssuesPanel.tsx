import { ChevronDown, ChevronUp, ListChecks, RotateCw, Send, TriangleAlert } from "lucide-react"
import type React from "react"
import { useMemo } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useTranslation } from "@/i18n"
import type { PreviewIssue } from "@/pages/front-design/types"

export interface FrontDesignIssuesPanelProps {
  issues: PreviewIssue[]
  runtimeCount: number
  a11yCount: number
  isStreaming: boolean
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: Set<string>
  isAllSelected: boolean
  onToggleIssue: (id: string) => void
  onToggleAll: () => void
  onRerun: () => void
  onSend: () => void
}

/**
 * FrontDesignIssuesPanel - 画布底部体检条与展开面板：运行时报错 + 可用性问题多选回流 Agent。
 */
export const FrontDesignIssuesPanel = ({
  issues,
  runtimeCount,
  a11yCount,
  isStreaming,
  isOpen,
  onOpenChange,
  selectedIds,
  isAllSelected,
  onToggleIssue,
  onToggleAll,
  onRerun,
  onSend,
}: FrontDesignIssuesPanelProps): React.JSX.Element => {
  const { t } = useTranslation()

  const runtimeIssues = useMemo(() => issues.filter((issue) => issue.group === "runtime"), [issues])
  const a11yIssues = useMemo(() => issues.filter((issue) => issue.group === "a11y"), [issues])
  const selectedCount = selectedIds.size
  const hasIssues = issues.length > 0

  const renderGroup = (
    title: string,
    groupIssues: PreviewIssue[],
    toneClass: string,
  ): React.JSX.Element | null => {
    if (groupIssues.length === 0) return null
    return (
      <div className="mt-1.5">
        <div className={`px-1 text-xs font-semibold ${toneClass}`}>
          {title} ({groupIssues.length})
        </div>
        <div className="mt-0.5">
          {groupIssues.map((issue) => {
            const isSelected = selectedIds.has(issue.id)
            return (
              <div
                key={issue.id}
                className="rounded-[4px] px-1 py-1 hover:bg-[var(--color-theme-surface-hover)]"
              >
                <div className="flex items-start gap-2">
                  <LxCheckbox
                    size="small"
                    checked={isSelected}
                    onChange={() => onToggleIssue(issue.id)}
                    aria-label={issue.message}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs leading-relaxed text-white/75">
                      {issue.message}
                      {issue.count > 1 && (
                        <span className="ml-1 font-mono text-xs text-white/35">×{issue.count}</span>
                      )}
                    </p>
                    {issue.detail && (
                      <details className="mt-1">
                        <summary className="cursor-pointer select-none text-xs text-white/35">
                          {t("common.more")}
                        </summary>
                        <pre className="custom-scrollbar mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-white/45">
                          {issue.detail}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      className="front-design-issues flex shrink-0 flex-col border-t"
      style={{ borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))" }}
    >
      {isOpen && (
        <div
          className="custom-scrollbar max-h-[240px] min-h-0 overflow-y-auto px-2 py-1.5"
          style={{ backgroundColor: "var(--color-theme-surface)" }}
        >
          {/* 操作条：全选 + 重新检测 + 回流 */}
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <div className="flex items-center gap-2">
              <LxCheckbox
                size="small"
                checked={isAllSelected}
                disabled={!hasIssues}
                onChange={onToggleAll}
                aria-label={t("frontDesign.issuesPanelSelectAll")}
              />
              <span className="text-xs text-white/45">{t("frontDesign.issuesPanelSelectAll")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <LxIconButton
                size="small"
                onClick={onRerun}
                aria-label={t("frontDesign.issuesPanelRerun")}
                title={{ content: t("frontDesign.issuesPanelRerun"), placement: "top" }}
              >
                <RotateCw />
              </LxIconButton>
              <LxIconButton
                size="small"
                disabled={selectedCount === 0}
                onClick={onSend}
                icon={<Send />}
                aria-label={t("frontDesign.issuesPanelSend", { count: selectedCount })}
              >
                <span className="text-xs">
                  {t("frontDesign.issuesPanelSend", { count: selectedCount })}
                </span>
              </LxIconButton>
            </div>
          </div>

          {hasIssues ? (
            <>
              {renderGroup(
                t("frontDesign.issuesPanelRuntimeGroup"),
                runtimeIssues,
                "text-rose-400",
              )}
              {renderGroup(t("frontDesign.issuesPanelA11yGroup"), a11yIssues, "text-amber-400")}
            </>
          ) : (
            <div className="flex items-center justify-center py-3 text-xs text-white/35">
              {isStreaming ? t("frontDesign.issuesBarGenerating") : t("frontDesign.issuesBarEmpty")}
            </div>
          )}
        </div>
      )}

      {/* 状态条：计数摘要与展开开关 */}
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(!isOpen)}
        className="flex h-8 cursor-pointer items-center gap-2 px-2.5 text-left"
        style={{ backgroundColor: "var(--color-theme-surface-hover)" }}
      >
        <ListChecks className="h-3.5 w-3.5 shrink-0 text-white/45" />
        <span className="shrink-0 text-xs font-semibold text-white/70">
          {t("frontDesign.issuesBarTitle")}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {isStreaming ? (
            <span className="truncate text-xs text-white/35">
              {t("frontDesign.issuesBarGenerating")}
            </span>
          ) : hasIssues ? (
            <>
              {runtimeCount > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-rose-400">
                  <TriangleAlert className="h-3 w-3" />
                  {t("frontDesign.issuesBarRuntime", { count: runtimeCount })}
                </span>
              )}
              {a11yCount > 0 && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-amber-400">
                  <TriangleAlert className="h-3 w-3" />
                  {t("frontDesign.issuesBarA11y", { count: a11yCount })}
                </span>
              )}
            </>
          ) : (
            <span className="truncate text-xs text-white/35">
              {t("frontDesign.issuesBarEmpty")}
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/45" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/45" />
        )}
      </button>
    </div>
  )
}
