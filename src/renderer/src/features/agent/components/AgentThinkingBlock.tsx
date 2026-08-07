import { Brain, ChevronDown, CornerDownRight } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"

// 思考块组件属性类型。
interface AgentThinkingBlockProps {
  // Markdown 格式的思考内容。
  content: string
  // 是否正在流式生成。
  isGenerating?: boolean
}

/**
 * 渲染可折叠的 Agent 思考时间线节点。
 */
export const AgentThinkingBlock = ({
  content,
  isGenerating = false,
}: AgentThinkingBlockProps): React.JSX.Element => {
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
  }, [content, isExpanded])

  return (
    <div className="my-1.5 w-full">
      <div className="min-w-0">
        <button
          type="button"
          aria-label="思考过程"
          aria-expanded={isExpanded}
          className="flex h-5 w-fit items-center gap-1 rounded-[6px] bg-[#212121] pr-2 text-[12px] text-white/50 transition-all duration-200 hover:bg-[#212121]/80 hover:text-white/70 focus:outline-none"
          onClick={() => setIsExpanded((previousExpanded) => !previousExpanded)}
        >
          <Brain className="h-3.5 w-3.5 shrink-0 text-rose-300" />
          <span className="text-rose-300">{isGenerating ? "Thinking" : "Thought Process"}</span>
          {isGenerating && (
            <span className="relative ml-0.5 flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/40 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white/50" />
            </span>
          )}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
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
          <div
            ref={innerRef}
            className="flex min-w-0 items-start gap-1 select-text pl-1 pt-1 text-white/45"
          >
            <CornerDownRight className="mt-1 h-3 w-3 shrink-0" />
            <div className="custom-scrollbar max-h-72 min-w-0 flex-1 overflow-y-auto">
              <LxMarkdownPreview
                html={markdownRenderer.render(content)}
                previewMode="preview"
                previewRef={previewRef}
                className="px-0 text-white/45"
                contentClassName="py-0 text-white/45 [&_*]:!text-white/45"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
