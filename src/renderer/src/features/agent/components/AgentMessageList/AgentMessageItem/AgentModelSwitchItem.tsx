import { ChevronDown, Cpu, Sparkles } from "lucide-react"
import type React from "react"
import { Fragment, useLayoutEffect, useRef, useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import type { ChatMessage } from "@/features/agent/types"
import { useTranslation } from "@/i18n"

export interface AgentModelSwitchItemProps {
  message: ChatMessage
}

/**
 * 渲染可折叠的模型切换/初始模型条目
 */
export const AgentModelSwitchItem = ({
  message,
}: AgentModelSwitchItemProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const isInitial = message.isInitial === true
  const titleText = isInitial
    ? t("agent.initialModelTitle", { model: message.model || message.provider || "" }) ||
      `Initial Model: ${message.model || message.provider || ""}`
    : t("agent.modelSwitchedTitle", { model: message.model || message.provider || "" }) ||
      `Switched to ${message.model || message.provider || ""}`

  const instructions = message.instructions || ""

  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element || !isExpanded) {
      setContentHeight(null)
      return undefined
    }

    const updateHeight = (): void => setContentHeight(element.scrollHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)

    return () => observer.disconnect()
  }, [instructions, isExpanded])

  const metricSegments: React.ReactNode[] = []
  if (message.provider) {
    metricSegments.push(<span key="provider">PROVIDER {message.provider}</span>)
  }
  if (message.family) {
    metricSegments.push(<span key="family">FAMILY {message.family.toUpperCase()}</span>)
  }

  return (
    <div className="agent-model-switch-item my-1.5 w-full max-w-full select-none">
      <button
        type="button"
        aria-label={titleText}
        aria-expanded={isExpanded}
        className="agent-model-switch-toggle-btn mb-1 flex h-5 w-full items-center gap-1.5 text-[11px] font-medium text-cyan-300/60 transition-colors hover:text-cyan-200 focus:outline-none"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <Cpu className="h-3.5 w-3.5 text-cyan-400/80" />
        <span className="agent-model-switch-title italic">{titleText}</span>
        {instructions ? (
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${
              isExpanded ? "" : "-rotate-90"
            }`}
          />
        ) : null}
      </button>

      {metricSegments.length > 0 && (
        <div className="agent-message-usage mb-1 flex items-center gap-1 text-[10px] leading-none text-white/35 select-text tabular-nums whitespace-nowrap">
          {metricSegments.map((segment, index) => (
            <Fragment key={index}>
              {index > 0 && (
                <span aria-hidden="true" className="agent-message-usage-separator">
                  ·
                </span>
              )}
              <span className="agent-message-usage-item">{segment}</span>
            </Fragment>
          ))}
        </div>
      )}

      {instructions ? (
        <div
          style={{
            maxHeight: isExpanded
              ? contentHeight !== null
                ? `${contentHeight}px`
                : `${innerRef.current?.scrollHeight ?? 0}px`
              : "0px",
            opacity: isExpanded ? 1 : 0,
            transition:
              "max-height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)",
          }}
          className="overflow-hidden"
        >
          <div ref={innerRef} className="w-full">
            <div className="agent-model-switch-bubble rounded-[18px] rounded-bl-[4px] bg-[#22272e] border border-cyan-500/10 px-3 py-2 text-[13px] text-white/60">
              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wider text-cyan-300/80 uppercase">
                <Sparkles className="h-3 w-3" />
                <span>{t("agent.vendorPrompt")}</span>
              </div>
              <LxMarkdownPreview
                html={markdownRenderer.render(instructions)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0"
                contentClassName="py-0 [&_*]:!text-white/60 [&_h2]:!text-cyan-300/90 [&_h3]:!text-cyan-300/80"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
