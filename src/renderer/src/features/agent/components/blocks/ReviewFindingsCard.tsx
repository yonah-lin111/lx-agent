import {
  Check,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  Square,
  Wrench,
} from "lucide-react"
import type React from "react"
import { useCallback, useId, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ReviewFindingItem, ReviewFindingsData, ReviewSeverity } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface ReviewFindingsCardProps {
  findingsData: ReviewFindingsData
  isStreaming?: boolean
  onApplyFixes?: (selectedFindings: ReviewFindingItem[]) => void
  onFillInput?: (text: string) => void
  readOnly?: boolean
  hasSubsequentUserMessage?: boolean
}

const DEFAULT_VISIBLE_COUNT = 2

const SEVERITY_COLORS: Record<ReviewSeverity, { bg: string; text: string; border: string }> = {
  critical: { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" },
  high: { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" },
  medium: { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30" },
  low: { bg: "bg-zinc-500/15", text: "text-zinc-400", border: "border-zinc-500/30" },
}

/**
 * FindingItemCard - 单个审查项渲染组件（使用 LxMarkdownPreview 渲染富文本内容与代码块）。
 */
interface FindingItemCardProps {
  item: ReviewFindingItem
  isSelected: boolean
  isExpanded: boolean
  onToggleSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  onOpenFile: (filePath: string, line?: number) => void
}

const FindingItemCard = ({
  item,
  isSelected,
  isExpanded,
  onToggleSelect,
  onToggleExpand,
  onOpenFile,
}: FindingItemCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)
  const suggestionPreviewRef = useRef<HTMLDivElement>(null)
  const severityStyle = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.medium

  return (
    <div
      data-finding-id={item.id}
      data-severity={item.severity}
      data-selected={isSelected ? "true" : undefined}
      className={`review-finding-item rounded-lg border transition-all ${
        isSelected
          ? "border-violet-500/30 bg-violet-500/[0.04]"
          : "border-white/5 bg-white/[0.02]"
      } p-2.5`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onToggleSelect(item.id)}
            className="mt-0.5 text-white/40 hover:text-white/80 transition-colors focus:outline-none"
          >
            {isSelected ? (
              <CheckSquare className="h-3.5 w-3.5 text-violet-400" />
            ) : (
              <Square className="h-3.5 w-3.5" />
            )}
          </button>

          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className={`review-finding-severity rounded border px-1.5 py-0.2 text-[10px] font-semibold uppercase ${severityStyle.bg} ${severityStyle.text} ${severityStyle.border}`}
              >
                {item.severity}
              </span>
              <span className="review-finding-title text-[13px] font-medium text-white/95 truncate">
                {item.title}
              </span>
            </div>

            {/* 文件行跳转 */}
            <button
              type="button"
              onClick={() => onOpenFile(item.location.filePath, item.location.lineStart)}
              className="review-finding-file-link flex items-center gap-1 text-[11px] font-mono text-cyan-400/80 hover:text-cyan-300 transition-colors w-fit focus:outline-none"
            >
              <ExternalLink className="h-3 w-3" />
              <span>
                {item.location.filePath}:{item.location.lineStart}
                {item.location.lineEnd ? `-${item.location.lineEnd}` : ""}
              </span>
            </button>

            {/* 问题描述：使用 LxMarkdownPreview 渲染富文本 */}
            <div className="review-finding-description text-[12px] text-white/85 leading-relaxed mt-0.5">
              <LxMarkdownPreview
                html={markdownRenderer.render(item.description)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0"
                contentClassName="py-0 text-[12px] text-white/80"
                sanitizeCopy
              />
            </div>

            {/* 修复建议折叠展开：使用 LxMarkdownPreview 渲染代码或方案 */}
            {item.suggestion && (
              <div className="review-finding-suggestion mt-1">
                <button
                  type="button"
                  onClick={() => onToggleExpand(item.id)}
                  className="review-finding-suggestion-toggle flex items-center gap-1 text-[11px] text-violet-400/90 hover:text-violet-300 transition-colors focus:outline-none"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <Sparkles className="h-3 w-3" />
                  <span>{t("agent.review.fixSuggestion")}</span>
                </button>

                {isExpanded && (
                  <div className="review-finding-suggestion-content mt-1.5 rounded-md bg-black/30 border border-white/5 p-2 font-mono text-[11.5px] text-white/85 leading-relaxed">
                    <LxMarkdownPreview
                      html={markdownRenderer.render(item.suggestion)}
                      previewMode="preview"
                      previewRef={suggestionPreviewRef}
                      className="px-0"
                      contentClassName="py-0 text-[11.5px]"
                      sanitizeCopy
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * ReviewFindingsCard - 渲染代码审查结果与发现项列表。
 * 支持多选勾选、按 Severity 分类高亮、代码行精准跳转、LxMarkdownPreview 渲染、默认展示 2 条并支持省略号展开、一键回填与一键修复。
 */
export const ReviewFindingsCard = ({
  findingsData,
  isStreaming = false,
  onApplyFixes,
  onFillInput,
  readOnly = false,
  hasSubsequentUserMessage = false,
}: ReviewFindingsCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { summary, findings } = findingsData
  const summaryPreviewRef = useRef<HTMLDivElement>(null)
  const contentId = useId()

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(findings.map((f) => f.id)),
  )
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isListExpanded, setIsListExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const isExecutionDisabled = Boolean(hasSubsequentUserMessage)

  // 统计各级别数量
  const counts = useMemo(() => {
    const stats: Record<ReviewSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
    for (const f of findings) {
      if (f.severity in stats) {
        stats[f.severity]++
      }
    }
    return stats
  }, [findings])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === findings.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(findings.map((f) => f.id)))
    }
  }, [findings, selectedIds.size])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // 复制报告
  const handleCopy = useCallback(async (): Promise<void> => {
    if (!findingsData.raw) return
    try {
      await navigator.clipboard.writeText(findingsData.raw)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [findingsData.raw])

  // 打开文件定位
  const handleOpenFile = useCallback((filePath: string, line?: number) => {
    if (window.api?.agent?.openFileAt && line !== undefined) {
      void window.api.agent.openFileAt(filePath, line)
    }
  }, [])

  // 选中的 Finding 列表
  const selectedFindings = useMemo(
    () => findings.filter((f) => selectedIds.has(f.id)),
    [findings, selectedIds],
  )

  // 填入输入框
  const handleFillInput = useCallback(() => {
    if (!onFillInput || selectedFindings.length === 0) return
    const text = selectedFindings
      .map(
        (f, idx) =>
          `${idx + 1}. Fix "${f.title}" at \`${f.location.filePath}:${f.location.lineStart}\`: ${f.suggestion || f.description}`,
      )
      .join("\n")
    onFillInput(`Please fix the following review issues:\n\n${text}`)
  }, [onFillInput, selectedFindings])

  // 采纳并修复
  const handleApplyFixes = useCallback(() => {
    if (isStreaming || isExecutionDisabled || !onApplyFixes || selectedFindings.length === 0) return
    onApplyFixes(selectedFindings)
  }, [isExecutionDisabled, isStreaming, onApplyFixes, selectedFindings])

  // 默认展示 2 条完整的 Finding 项
  const visibleFindings = useMemo(() => {
    if (isListExpanded || findings.length <= DEFAULT_VISIBLE_COUNT) {
      return findings
    }
    return findings.slice(0, DEFAULT_VISIBLE_COUNT)
  }, [findings, isListExpanded])

  const hasMoreFindings = findings.length > DEFAULT_VISIBLE_COUNT

  return (
    <div className="review-findings-card my-2.5 w-full min-w-0 rounded-xl border border-violet-500/25 bg-violet-500/[0.03] p-3.5 shadow-sm transition-all duration-200">
      {/* 头部：徽标、统计与复制 */}
      <div className="review-findings-header flex items-center justify-between gap-2 border-b border-violet-500/15 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="review-findings-icon-wrapper flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-violet-400">
            <ShieldAlert className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 items-center gap-1.5 flex-wrap">
            <span className="review-findings-badge shrink-0 rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
              {t("agent.review.badge")}
            </span>
            <span className="review-findings-title truncate text-[13px] font-semibold text-white/95">
              {findings.length > 0
                ? `${findings.length} ${t("agent.review.findingsCount")}`
                : t("agent.review.noFindings")}
            </span>

            {/* 严重级别分布 Chip */}
            {counts.critical > 0 && (
              <span className="review-severity-badge-critical rounded bg-red-500/20 border border-red-500/30 px-1.5 py-0.2 text-[10px] font-medium text-red-300">
                {counts.critical} Critical
              </span>
            )}
            {counts.high > 0 && (
              <span className="review-severity-badge-high rounded bg-amber-500/20 border border-amber-500/30 px-1.5 py-0.2 text-[10px] font-medium text-amber-300">
                {counts.high} High
              </span>
            )}
            {counts.medium > 0 && (
              <span className="review-severity-badge-medium rounded bg-blue-500/20 border border-blue-500/30 px-1.5 py-0.2 text-[10px] font-medium text-blue-300">
                {counts.medium} Medium
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isStreaming && (
            <div className="flex items-center gap-1.5 text-[11px] text-violet-400/80 italic mr-1">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-violet-400" />
              <span>{t("agent.review.auditing")}</span>
            </div>
          )}

          <LxIconButton
            size="small"
            aria-label={t("agent.review.copyReport")}
            title={{
              content: copied ? t("common.copied") : t("agent.review.copyReport"),
              placement: "top",
            }}
            onClick={handleCopy}
            className="review-findings-copy-btn"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-violet-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </LxIconButton>
        </div>
      </div>

      {/* 概要说明：使用 LxMarkdownPreview 渲染 */}
      {summary && (
        <div className="review-findings-summary mt-2.5 rounded-lg bg-black/20 px-3 py-2 text-[12.5px] leading-relaxed text-white/80">
          <LxMarkdownPreview
            html={markdownRenderer.render(summary)}
            previewMode="preview"
            previewRef={summaryPreviewRef}
            className="px-0"
            contentClassName="py-0 text-[12.5px]"
            sanitizeCopy
          />
        </div>
      )}

      {/* 发现项列表 */}
      {findings.length > 0 && (
        <div id={contentId} className="review-findings-list mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px] text-white/50 px-1">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-1 hover:text-white/80 transition-colors focus:outline-none"
            >
              {selectedIds.size === findings.length ? (
                <CheckSquare className="h-3.5 w-3.5 text-violet-400" />
              ) : (
                <Square className="h-3.5 w-3.5" />
              )}
              <span>
                {selectedIds.size === findings.length
                  ? t("common.deselectAll")
                  : t("common.selectAll")}
              </span>
            </button>
            <span>
              {t("agent.review.selectedCount", { count: selectedIds.size, total: findings.length })}
            </span>
          </div>

          {visibleFindings.map((item) => (
            <FindingItemCard
              key={item.id}
              item={item}
              isSelected={selectedIds.has(item.id)}
              isExpanded={expandedIds.has(item.id)}
              onToggleSelect={toggleSelect}
              onToggleExpand={toggleExpand}
              onOpenFile={handleOpenFile}
            />
          ))}
        </div>
      )}

      {/* 底部操作栏：左侧展开/收起剩余项，右侧一键回填与一键修复 */}
      <div className="review-findings-footer mt-3 flex items-center justify-between gap-2 border-t border-violet-500/15 pt-2.5">
        {/* 左侧：省略号展开/折叠 */}
        <div>
          {hasMoreFindings && (
            <button
              type="button"
              aria-expanded={isListExpanded}
              aria-controls={contentId}
              onClick={(e) => {
                e.stopPropagation()
                setIsListExpanded((prev) => !prev)
              }}
              className="review-findings-expand-toggle inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-[11px] font-medium text-violet-400/90 transition-colors hover:text-violet-300 select-none focus:outline-none"
            >
              <span className="italic underline underline-offset-2">
                {isListExpanded
                  ? t("common.collapse")
                  : `...${t("common.more")} (${findings.length - DEFAULT_VISIBLE_COUNT})`}
              </span>
            </button>
          )}
        </div>

        {/* 右侧：操作按钮 */}
        {findings.length > 0 && !readOnly && (
          <div className="flex shrink-0 items-center gap-2">
            {onFillInput && (
              <button
                type="button"
                disabled={selectedFindings.length === 0}
                onClick={handleFillInput}
                className="review-findings-fill-btn flex h-7 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[11.5px] text-white/70 hover:bg-white/5 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <span>{t("agent.review.fillInput")}</span>
              </button>
            )}

            {onApplyFixes && (
              <button
                type="button"
                disabled={isStreaming || isExecutionDisabled || selectedFindings.length === 0}
                data-accepted={isExecutionDisabled ? "true" : undefined}
                onClick={handleApplyFixes}
                className={`review-findings-apply-btn flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-all ${
                  isExecutionDisabled
                    ? "bg-white/5 text-white/30 cursor-not-allowed pointer-events-none opacity-40 border border-white/5 shadow-none"
                    : isStreaming || selectedFindings.length === 0
                      ? "bg-white/5 text-white/40 cursor-not-allowed border border-white/10"
                      : "bg-violet-600 text-white hover:bg-violet-500 active:scale-[0.98] shadow-sm cursor-pointer"
                }`}
              >
                {isExecutionDisabled ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-white/30" />
                    <span>{t("agent.review.fixesApplied")}</span>
                  </>
                ) : (
                  <>
                    <Wrench className="h-3 w-3" />
                    <span>{t("agent.review.applyFixes")}</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
