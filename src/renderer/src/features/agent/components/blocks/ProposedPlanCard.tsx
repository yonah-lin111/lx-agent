import { Check, ClipboardCheck, Copy, Play } from "lucide-react"
import type React from "react"
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import type { ProposedPlanData } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface ProposedPlanCardProps {
  plan: ProposedPlanData
  isStreaming?: boolean
  onAccept?: (plan: ProposedPlanData) => void
  readOnly?: boolean
  maxLines?: number
}

const DEFAULT_MAX_LINES = 30

/**
 * ProposedPlanCard - 渲染 AI 生成的 <proposed_plan> 实施方案卡片。
 * 包含结构化 Markdown 预览、30 行参数省略号折叠（无滚动条）、复制方案与一键"采纳并执行"门禁流转。
 */
export const ProposedPlanCard = ({
  plan,
  isStreaming = false,
  onAccept,
  readOnly = false,
  maxLines = DEFAULT_MAX_LINES,
}: ProposedPlanCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { successToast } = useLxAgentToast()
  const previewRef = useRef<HTMLDivElement>(null)
  const contentContainerRef = useRef<HTMLDivElement>(null)
  const contentId = useId()

  const [copied, setCopied] = useState(false)
  const [isAccepted, setIsAccepted] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)

  const title = plan.title || t("agent.proposedPlanDefaultTitle")

  // 检测内容是否超出 maxLines
  useLayoutEffect(() => {
    const el = contentContainerRef.current
    if (!el) return
    const hasOverflow = el.scrollHeight > el.clientHeight + 1
    setIsOverflowing(hasOverflow)
  }, [plan.content, maxLines])

  // 处理窗口或容器尺寸变动检测
  useLayoutEffect(() => {
    const el = contentContainerRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      if (!isExpanded && el) {
        setIsOverflowing(el.scrollHeight > el.clientHeight + 1)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded])

  const handleCopy = useCallback(async () => {
    if (!plan.content) return
    try {
      await navigator.clipboard.writeText(plan.content)
      setCopied(true)
      successToast(t("agent.planCopied"))
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy plan:", err)
    }
  }, [plan.content, successToast, t])

  const handleAccept = useCallback(() => {
    if (isStreaming || isAccepted || !onAccept) return
    setIsAccepted(true)
    onAccept(plan)
  }, [isAccepted, isStreaming, onAccept, plan])

  const lineClampStyle: React.CSSProperties = isExpanded
    ? {}
    : {
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }

  return (
    <div className="proposed-plan-card my-2 w-full min-w-0 rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3.5 shadow-sm transition-all duration-200">
      {/* 头部：标题与操作栏 */}
      <div className="proposed-plan-header flex items-center justify-between gap-2 border-b border-emerald-500/20 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="proposed-plan-icon-wrapper flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-500/20 text-emerald-400">
            <ClipboardCheck className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center gap-1.5">
              <span className="proposed-plan-badge rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                {t("agent.proposedPlanBadge")}
              </span>
              <span className="proposed-plan-title truncate text-[13px] font-semibold text-white/95">
                {title}
              </span>
            </div>
          </div>
        </div>

        {/* 顶部操作区 */}
        <div className="flex shrink-0 items-center gap-1.5">
          <LxTooltip content={copied ? t("agent.copied") : t("agent.copyPlan")}>
            <LxIconButton
              icon={
                copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )
              }
              onClick={handleCopy}
              className="h-7 w-7 text-white/60 hover:text-white"
            />
          </LxTooltip>

          {!readOnly && onAccept && (
            <button
              type="button"
              disabled={isStreaming || isAccepted}
              data-accepted={isAccepted ? "true" : undefined}
              onClick={handleAccept}
              className={`proposed-plan-accept-btn flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-all ${
                isAccepted
                  ? "bg-emerald-500/20 text-emerald-300 cursor-not-allowed pointer-events-none opacity-90"
                  : isStreaming
                    ? "bg-white/5 text-white/40 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98] shadow-sm cursor-pointer"
              }`}
            >
              {isAccepted ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
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

      {/* 计划 Markdown 正文：无滚动条，默认 30 行截断，支持省略号展开/折叠 */}
      <div className="proposed-plan-body mt-2.5 px-1 pr-2 text-[13px] leading-relaxed text-white/90">
        <div id={contentId} ref={contentContainerRef} style={lineClampStyle}>
          <LxMarkdownPreview
            html={markdownRenderer.render(plan.content)}
            previewMode="preview"
            previewRef={previewRef}
            className="px-0"
            contentClassName="py-1 text-[13px]"
            sanitizeCopy
          />
        </div>

        {/* 超出 30 行时展示参数省略号折叠按钮 */}
        {(isOverflowing || isExpanded) && (
          <div className="mt-1 flex items-center">
            <button
              type="button"
              aria-expanded={isExpanded}
              aria-controls={contentId}
              onClick={(e) => {
                e.stopPropagation()
                setIsExpanded((prev) => !prev)
              }}
              className="proposed-plan-expand-toggle inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-[11px] font-medium text-emerald-400/90 transition-colors hover:text-emerald-300 select-none focus:outline-none"
            >
              <span className="italic underline underline-offset-2">
                {isExpanded ? t("common.collapse") : `...${t("common.more")}`}
              </span>
            </button>
          </div>
        )}

        {isStreaming && (
          <div className="flex items-center gap-2 py-1.5 text-[11px] text-emerald-400/70 italic">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-400" />
            <span>{t("agent.planGenerating")}</span>
          </div>
        )}
      </div>
    </div>
  )
}
