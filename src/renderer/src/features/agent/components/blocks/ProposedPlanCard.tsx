import { Check, ClipboardCheck, Copy, Play } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { isPlanAccepted, markPlanAccepted } from "@/features/agent/stores/planAcceptedStore"
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

const DEFAULT_MAX_LINES = 30
const ESTIMATED_LINE_HEIGHT_PX = 22

/**
 * ProposedPlanCard - 渲染 AI 生成的 <proposed_plan> 实施方案卡片。
 * 包含结构化 Markdown 预览、30 行参数省略号折叠（无滚动条）、单图标复制与一键"采纳并执行"门禁流转。
 * 遵循极简中性暗黑美学，无硬编码刺眼色系；若下方已有用户消息或已点击过则永久禁用执行。
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
  const { successToast } = useLxAgentToast()
  const previewRef = useRef<HTMLDivElement>(null)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const contentId = useId()

  const title = plan.title || t("agent.proposedPlanDefaultTitle")
  const planKey = useMemo(
    () => `${plan.title || "plan"}_${plan.content.length}_${plan.content.slice(0, 60)}`,
    [plan.title, plan.content],
  )

  const [copied, setCopied] = useState(false)
  const [isAccepted, setIsAccepted] = useState(() => isPlanAccepted(planKey))
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  // 若本地已采纳或下方已有 user 消息，则视为已执行过，不可再次点击
  const isExecutionDisabled = isAccepted || Boolean(hasSubsequentUserMessage)

  const maxCollapsedHeight = maxLines * ESTIMATED_LINE_HEIGHT_PX
  const rawLineCount = useMemo(() => plan.content.split("\n").length, [plan.content])

  // 同步持久化状态
  useEffect(() => {
    setIsAccepted(isPlanAccepted(planKey))
  }, [planKey])

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

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation()
      if (!plan.content) return
      try {
        await navigator.clipboard.writeText(plan.content)
        setCopied(true)
        successToast(t("agent.planCopied"))
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current)
        }
        copyTimeoutRef.current = setTimeout(() => {
          setCopied(false)
        }, 2000)
      } catch (err) {
        console.error("Failed to copy plan:", err)
      }
    },
    [plan.content, successToast, t],
  )

  const handleAccept = useCallback(() => {
    if (isStreaming || isExecutionDisabled || !onAccept) return
    setIsAccepted(true)
    markPlanAccepted(planKey)
    onAccept(plan)
  }, [isExecutionDisabled, isStreaming, onAccept, plan, planKey])

  return (
    <div className="proposed-plan-card my-2.5 w-full min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 shadow-sm transition-all duration-200">
      {/* 头部：仅展示实施方案图标与标题 */}
      <div className="proposed-plan-header flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="proposed-plan-icon-wrapper flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-white/90">
            <ClipboardCheck className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="proposed-plan-badge shrink-0 rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
              {t("agent.proposedPlanBadge")}
            </span>
            <span className="proposed-plan-title truncate text-[13px] font-semibold text-white/95">
              {title}
            </span>
          </div>
        </div>

        {isStreaming && (
          <div className="flex items-center gap-1.5 text-[11px] text-white/60 italic">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white/70" />
            <span>{t("agent.planGenerating")}</span>
          </div>
        )}
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
          {/* 截断时的底部渐变遮罩 */}
          {!isExpanded && isOverflowing && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--color-theme-surface,#18181b)]/95 to-transparent" />
          )}
        </div>
      </div>

      {/* 底部操作栏：左侧参数省略号展开/收起，右侧单图标复制与采纳执行操作 */}
      <div className="proposed-plan-footer mt-2.5 flex items-center justify-between gap-2 border-t border-white/[0.08] pt-2.5">
        {/* 左侧：折叠/展开按钮 */}
        <div>
          {(isOverflowing || isExpanded) && (
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-controls={contentId}
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded((prev) => !prev)
              }}
              className="proposed-plan-expand-toggle inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-[11px] font-medium text-white/60 transition-colors hover:text-white select-none focus:outline-none"
            >
              <span className="italic underline underline-offset-2">
                {isExpanded ? t("common.collapse") : `...${t("common.more")}`}
              </span>
            </button>
          )}
        </div>

        {/* 右侧：单图标复制方案与采纳执行按钮 */}
        <div className="flex shrink-0 items-center gap-2">
          <LxTooltip content={copied ? t("agent.copied") : t("agent.copyPlan")}>
            <button
              type="button"
              onClick={handleCopy}
              aria-label={t("agent.copyPlan")}
              className="proposed-plan-copy-btn flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-white/50 transition-colors hover:bg-white/10 hover:text-white active:scale-95 cursor-pointer select-none"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </LxTooltip>

          {!readOnly && onAccept && (
            <button
              type="button"
              disabled={isStreaming || isExecutionDisabled}
              data-accepted={isExecutionDisabled ? "true" : undefined}
              onClick={handleAccept}
              className={`proposed-plan-accept-btn flex h-7 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium transition-all ${
                isExecutionDisabled
                  ? "bg-white/5 text-white/35 cursor-not-allowed pointer-events-none opacity-80 border border-white/5"
                  : isStreaming
                    ? "bg-white/5 text-white/40 cursor-not-allowed border border-white/10"
                    : "bg-white text-black hover:bg-white/90 active:scale-[0.98] shadow-sm cursor-pointer"
              }`}
            >
              {isExecutionDisabled ? (
                <>
                  <Check className="h-3.5 w-3.5 text-white/40" />
                  <span>{t("agent.planAccepted")}</span>
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current" />
                  <span>{t("agent.acceptAndExecute")}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
