import { ChevronDown, Loader2 } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"

// 压缩摘要组件属性类型。
interface AgentCompactionSummaryProps {
  // Markdown 格式的压缩摘要内容。
  summary: string
  // 压缩进行中：渲染 loading 占位（摘要生成完成前展示）。
  isLoading?: boolean
  // 是否为手动触发的压缩（/compact），用于区分文案与折叠标题。
  isManual?: boolean
}

/**
 * 渲染可折叠的上下文压缩摘要，默认折叠展示。
 */
export const AgentCompactionSummary = ({
  summary,
  isLoading = false,
  isManual = false,
}: AgentCompactionSummaryProps): React.JSX.Element => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

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
  }, [summary, isExpanded])

  // 压缩进行中：仅转圈 + 文字（无气泡 loading 效果）。
  if (isLoading) {
    return (
      <div className="my-1.5 flex w-full max-w-full select-none items-center gap-1.5 text-[11px] font-medium text-white/35">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="italic">
          {isManual ? "Compressing context manually..." : "Compressing context automatically..."}
        </span>
      </div>
    )
  }

  const titleText = isManual
    ? "Conversation manually compressed into summary"
    : "Conversation compressed into summary"

  return (
    <div className="my-1.5 w-full max-w-full select-none">
      <button
        type="button"
        aria-label={titleText}
        aria-expanded={isExpanded}
        className="mb-1 flex h-5 w-full items-center gap-1.5 text-[11px] font-medium text-white/35 transition-colors hover:text-white/55 focus:outline-none"
        onClick={() => setIsExpanded((previousExpanded) => !previousExpanded)}
      >
        <span className="italic">{titleText}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${
            isExpanded ? "" : "-rotate-90"
          }`}
        />
      </button>
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
          <div className="rounded-[18px] rounded-bl-[4px] bg-[#303030] px-3 py-2 text-[13px] text-white/45">
            <LxMarkdownPreview
              html={markdownRenderer.render(summary)}
              previewMode="preview"
              previewRef={previewRef}
              className="px-0"
              contentClassName="py-0 [&_*]:!text-white/45"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
