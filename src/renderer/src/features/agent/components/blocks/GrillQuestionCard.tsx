import { Check, Copy, MessageCircleQuestion } from "lucide-react"
import type React from "react"
import { useCallback, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTag } from "@/components/ui/LxTag"
import type { GrillQuestionData } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface GrillQuestionCardProps {
  grill: GrillQuestionData
  isStreaming?: boolean
}

// 单字段 Markdown 预览（问题/推荐/举例共用同一渲染口径）。
const MarkdownField = ({
  value,
  isStreaming,
  previewRef,
}: {
  value: string
  isStreaming: boolean
  previewRef: React.RefObject<HTMLDivElement | null>
}): React.JSX.Element => (
  <LxMarkdownPreview
    html={renderMarkdown(value, { streaming: isStreaming })}
    previewMode="preview"
    previewRef={previewRef}
    disableStickyBlockHeaders={isStreaming}
    className="px-0"
    contentClassName="py-0 text-sm"
    sanitizeCopy
  />
)

/**
 * GrillQuestionCard - 渲染 plan 模式 grill-me 技能的 <grill_question> 决策卡片。
 * 三段式结构：问题 / 推荐 / 推荐举例说明（标签文案随语言本地化）；
 * sky 主题与 plan 模式底纹一致；右上角一键复制提问原始内容。流式未写完时按字段渐进补全。
 */
export const GrillQuestionCard = ({
  grill,
  isStreaming = false,
}: GrillQuestionCardProps): React.JSX.Element => {
  const { t } = useTranslation()
  const previewRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (): Promise<void> => {
    if (!grill.raw) return
    try {
      await navigator.clipboard.writeText(grill.raw)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [grill.raw])

  const hasAnyField = Boolean(grill.question || grill.recommendation || grill.example)

  return (
    <div className="grill-question-card my-2.5 w-full min-w-0 rounded-xl border border-sky-500/20 bg-sky-500/[0.04] p-3.5 shadow-sm transition-all duration-200">
      <div className="grill-question-header flex items-center justify-between gap-2 border-b border-sky-500/15 pb-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grill-question-icon-wrapper flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sky-500/15 text-sky-300">
            <MessageCircleQuestion className="h-3.5 w-3.5" />
          </div>
          <LxTag
            size="small"
            bgClass="border-sky-500/20 bg-sky-500/10"
            textClass="text-sky-300"
            className="grill-question-badge shrink-0"
          >
            {t("agent.grillQuestionBadge")}
          </LxTag>
        </div>

        <LxIconButton
          size="small"
          aria-label={t("agent.grillQuestionCopy")}
          title={{
            content: copied ? t("common.copied") : t("agent.grillQuestionCopy"),
            placement: "top",
          }}
          onClick={handleCopy}
          className="grill-question-copy-btn shrink-0"
        >
          {copied ? <Check className="text-sky-300" /> : <Copy />}
        </LxIconButton>
      </div>

      <div className="grill-question-body mt-2.5 flex flex-col gap-2.5 text-sm text-white/90">
        {grill.question && (
          <div className="grill-question-section">
            <div className="grill-question-label mb-1 text-xs font-medium text-sky-300/90">
              {t("agent.grillQuestionQuestionLabel")}
            </div>
            <div className="break-words leading-relaxed">
              <MarkdownField
                value={grill.question}
                isStreaming={isStreaming}
                previewRef={previewRef}
              />
            </div>
          </div>
        )}

        {grill.options && grill.options.length > 0 && (
          <ul className="grill-question-options flex flex-col gap-1">
            {grill.options.map((option, index) => (
              <li
                key={`${option.key}-${index}`}
                className="grill-question-option flex items-start gap-2 rounded-md border border-sky-500/15 bg-sky-500/[0.06] px-2 py-1.5"
              >
                <span className="grill-question-option-key mt-0.5 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border border-sky-500/25 bg-sky-500/15 px-1 text-xs font-semibold leading-none text-sky-200">
                  {option.key}
                </span>
                <span className="grill-question-option-text min-w-0 flex-1 break-words text-sm leading-relaxed text-white/85">
                  {option.text}
                </span>
              </li>
            ))}
          </ul>
        )}

        {grill.recommendation && (
          <div className="grill-question-recommendation rounded-lg border border-sky-500/20 bg-sky-500/[0.07] p-2.5">
            <div className="grill-question-label mb-1 text-xs font-medium text-sky-300/90">
              {t("agent.grillQuestionRecommendationLabel")}
            </div>
            <div className="break-words leading-relaxed">
              <MarkdownField
                value={grill.recommendation}
                isStreaming={isStreaming}
                previewRef={previewRef}
              />
            </div>
          </div>
        )}

        {grill.example && (
          <div className="grill-question-example rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <div className="grill-question-label mb-1 text-xs font-medium text-white/50">
              {t("agent.grillQuestionExampleLabel")}
            </div>
            <div className="break-words leading-relaxed text-white/75">
              <MarkdownField
                value={grill.example}
                isStreaming={isStreaming}
                previewRef={previewRef}
              />
            </div>
          </div>
        )}

        {!hasAnyField && (
          <div className="grill-question-waiting text-sm text-white/40 italic">
            {t("agent.grillQuestionWaiting")}
          </div>
        )}
      </div>
    </div>
  )
}
