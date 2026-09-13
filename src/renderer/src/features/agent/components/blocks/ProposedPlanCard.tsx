import { Check, ClipboardCheck, Copy, Play } from "lucide-react"
import type React from "react"
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTag } from "@/components/ui/LxTag"
import type { ProposedPlanData } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface ProposedPlanCardProps {
  plan: ProposedPlanData
  isStreaming?: boolean
  onAccept?: (plan: ProposedPlanData) => void
  readOnly?: boolean
  maxLines?: number
  hasSubsequentUserMessage?: boolean
}

const DEFAULT_MAX_LINES = 20
const ESTIMATED_LINE_HEIGHT_PX = 22

/**
 * ProposedPlanCard - 渲染 AI 生成的 <proposed_plan> 实施方案卡片。
 * 包含结构化 Markdown 预览、30 行参数省略号折叠（无滚动条）、单图标复制（参考 AgentMessageItem）与"采纳并执行"。
 * 采用淡淡的绿色调与柔和暗色衬底；仅在下方已有用户消息时才禁用接受按钮（且禁用态无高亮）。
 */
export const ProposedPlanCard = ({
  plan,
  isStreaming = false,
  onAccept,
  readOnly = false,
  maxLines = DEFAULT_MAX_LINES,
  hasSubsequentUserMessage = false,
}: ProposedPlanCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const contentId = useId()

  const title = plan.title || t("agent.proposedPlanDefaultTitle")

  const [copied, setCopied] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  // 仅在下方存在用户消息时禁用（表示该方案已执行，不可重复点击）
  const isExecutionDisabled = Boolean(hasSubsequentUserMessage)

  const maxCollapsedHeight = maxLines * ESTIMATED_LINE_HEIGHT_PX
  const rawLineCount = useMemo(() => plan.content.split("\n").length, [plan.content])

  // 检测内容是否超出 30 行或折叠最大高度
  useLayoutEffect(() => {
    const el = contentContainerRef.current
    if (!el) return
    const hasOverflow = el.scrollHeight > maxCollapsedHeight + 16 || rawLineCount > maxLines
    setIsOverflowing(hasOverflow)
  }, [plan.content, maxCollapsedHeight, rawLineCount, maxLines])

  // 监听尺寸变动动态检测溢出
  useLayoutEffect(() => {
    const el = contentContainerRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      if (!isExpanded && el) {
        setIsOverflowing(el.scrollHeight > maxCollapsedHeight + 16 || rawLineCount > maxLines)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded, maxCollapsedHeight, rawLineCount, maxLines])

  // 复制逻辑：与 AgentMessageItem / AgentAssistantMessage 完全一致
  const handleCopy = useCallback(async (): Promise<void> => {
    if (!plan.content) return
    try {
      await navigator.clipboard.writeText(plan.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [plan.content])

  const handleAccept = useCallback(() => {
    if (isStreaming || isExecutionDisabled || !onAccept) return
    onAccept(plan)
  }, [isExecutionDisabled, isStreaming, onAccept, plan])

  return (
    <div className="proposed-plan-card my-2.5 w-full min-w-0 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-3.5 shadow-sm transition-all duration-200">
      {/* 头部第一行：图标、实施方案徽标与最右侧复制按钮 */}
      <div className="proposed-plan-header flex items-center justify-between gap-2 border-b border-emerald-500/15 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="proposed-plan-icon-wrapper flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-400">
            <ClipboardCheck className="h-3.5 w-3.5" />
          </div>
          <LxTag
            size="small"
            bgClass="border-emerald-500/20 bg-emerald-500/10"
            textClass="text-emerald-300"
            className="proposed-plan-badge shrink-0"
          >
            {t("agent.proposedPlanBadge")}
          </LxTag>
        </div>

        <LxIconButton
          size="small"
          aria-label={t("agent.copyPlan")}
          title={{
            content: copied ? t("common.copied") : t("agent.copyPlan"),
            placement: "top",
          }}
          onClick={handleCopy}
          className="proposed-plan-copy-btn shrink-0"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </LxIconButton>
      </div>

      {/* 单独一行的 title 与统计指标 Chip */}
      <div className="proposed-plan-title-row mt-2.5 flex items-center gap-2 flex-wrap">
        <span className="proposed-plan-title truncate text-[13px] font-semibold text-white/95">
          {title}
        </span>
        <LxTag
          size="small"
          bgClass="border-emerald-500/30 bg-emerald-500/20"
          textClass="text-emerald-300"
        >
          {rawLineCount} {t("frontDesign.lines")}
        </LxTag>
      </div>

      {/* 计划 Markdown 正文：无滚动条，默认 30 行截断，支持省略号展开/折叠 */}
      <div className="proposed-plan-body relative mt-2.5 px-0.5 text-[13px] leading-relaxed text-white/90">
        <div
          id={contentId}
          ref={contentContainerRef}
          style={
            !isExpanded && isOverflowing
              ? { maxHeight: `${maxCollapsedHeight}px`, overflow: "hidden" }
              : { maxHeight: "none", overflow: "visible" }
          }
          className="relative transition-[max-height] duration-200"
        >
          <LxMarkdownPreview
            html={markdownRenderer.render(plan.content)}
            previewMode="preview"
            previewRef={previewRef}
            className="px-0"
            contentClassName="py-1 text-[13px]"
            sanitizeCopy
          />
          {/* 截断时的底部淡绿渐变遮罩 */}
          {!isExpanded && isOverflowing && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#141b16] to-transparent" />
          )}
        </div>
      </div>

      {/* 底部操作栏：左侧参数省略号展开/收起，右侧采纳执行操作 */}
      <div className="proposed-plan-footer mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-emerald-500/15 pt-2.5">
        {/* 左侧：折叠/展开按钮 */}
        <div>
          {(isOverflowing || isExpanded) && (
            <LxIconButton
              variant="ghost"
              iconOnly={false}
              aria-expanded={isExpanded}
              aria-controls={contentId}
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded((prev) => !prev)
              }}
              textClass="text-emerald-400/90"
              className="proposed-plan-expand-toggle text-[11px] font-medium"
            >
              <span className="italic underline underline-offset-2">
                {isExpanded ? t("common.collapse") : `...${t("common.more")}`}
              </span>
            </LxIconButton>
          )}
        </div>

        {/* 右侧：采纳执行按钮 */}
        {!readOnly && onAccept && (
          <div className="flex shrink-0 items-center justify-end gap-2 min-w-0 max-w-full">
            <LxIconButton
              disabled={isStreaming || isExecutionDisabled}
              data-accepted={isExecutionDisabled ? "true" : undefined}
              onClick={handleAccept}
              textClass="text-white"
              hoverBgClass="hover:bg-emerald-500"
              className="proposed-plan-accept-btn bg-emerald-600 px-3 py-1 text-[12px] font-medium max-w-full"
              icon={
                isExecutionDisabled ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-white/30" />
                ) : (
                  <Play className="h-3 w-3 shrink-0 fill-current" />
                )
              }
            >
              <span className="break-words">
                {isExecutionDisabled ? t("agent.planAccepted") : t("agent.acceptAndExecute")}
              </span>
            </LxIconButton>
          </div>
        )}
      </div>
    </div>
  )
}
