import { CornerDownLeft } from "lucide-react"
import type React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"

// 折叠淡出动画时长（对齐 max-height/opacity 过渡）。
const COLLAPSE_DURATION_MS = 250

// 推荐问题组件属性。
type SuggestedQuestionsProps = {
  questions: string[]
  isLoading?: boolean
  // 点击问题：直接发送。
  onSelect?: (question: string) => void
  // 点击回显按钮：填入输入框并聚焦。
  onEcho?: (question: string) => void
}

/**
 * SuggestedQuestions - 展示可直接发送或回显到输入框的后续问题。
 * 无缩进；按钮宽度自适应内容；不可见时折叠淡出后卸载（对齐 AgentThinkingBlock）。
 */
export const SuggestedQuestions = ({
  questions,
  isLoading = false,
  onSelect,
  onEcho,
}: SuggestedQuestionsProps): React.JSX.Element | null => {
  const [mounted, setMounted] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const prevVisibleRef = useRef(false)

  const visible = isLoading || questions.length > 0

  // 可见性状态机：可见→挂载展开；不可见且曾可见→折叠淡出后卸载。
  useLayoutEffect(() => {
    if (visible) {
      prevVisibleRef.current = true
      setMounted(true)
      setCollapsed(false)
      return undefined
    }
    if (prevVisibleRef.current) {
      prevVisibleRef.current = false
      setCollapsed(true)
      const timer = window.setTimeout(() => setMounted(false), COLLAPSE_DURATION_MS)
      return () => window.clearTimeout(timer)
    }
    setMounted(false)
    return undefined
  }, [visible])

  // 测量内容高度，供 max-height 过渡使用。
  useLayoutEffect(() => {
    const element = contentRef.current
    if (!element || !mounted) {
      setContentHeight(null)
      return undefined
    }
    const updateHeight = (): void => setContentHeight(element.scrollHeight)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [mounted, questions, isLoading])

  if (!mounted) return null

  return (
    <div
      style={{
        maxHeight: collapsed ? "0px" : contentHeight !== null ? `${contentHeight}px` : undefined,
        opacity: collapsed ? 0 : 1,
        transition:
          "max-height 0.25s cubic-bezier(0.2, 0.85, 0.2, 1), opacity 0.25s cubic-bezier(0.2, 0.85, 0.2, 1)",
      }}
      className="overflow-hidden"
    >
      <div ref={contentRef} className="my-1.5 w-full max-w-full">
        <div className="mb-1.5 text-xs font-medium text-lime-300">Suggested questions</div>
        {isLoading ? (
          <div className="h-5 w-36 animate-pulse rounded-[6px] bg-white/5" />
        ) : (
          <div className="flex flex-col items-start gap-1">
            {questions.map((question) => (
              <div key={question} className="group/item flex w-fit max-w-full items-start gap-1">
                <button
                  type="button"
                  onClick={() => onSelect?.(question)}
                  className="max-w-full rounded-[6px] border border-white/10 px-2 py-1 text-left text-xs leading-relaxed text-white/65 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50"
                >
                  {question}
                </button>
                <LxIconButton
                  size="small"
                  aria-label="填入输入框"
                  title={{ content: "填入输入框", placement: "top" }}
                  onClick={() => onEcho?.(question)}
                  className="mt-1 opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100"
                >
                  <CornerDownLeft className="h-3 w-3" />
                </LxIconButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
