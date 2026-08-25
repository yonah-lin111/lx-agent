import type React from "react"
import { useId, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "@/i18n"

export interface FlowItemExpandableTextProps {
  // 文本内容
  content: string
  // 自定义样式类
  className?: string
  // 默认最大展示行数（默认为 3）
  maxLines?: number
  // 空状态文本保底
  fallbackText?: string
}

/**
 * FlowItemExpandableText - 执行流步骤专用的可折叠文本组件：
 * 最大显示 maxLines 行（默认 3 行），超出时截断展示省略号，并提供国际化的展开/折叠（...更多 / 收起）按钮。
 */
export const FlowItemExpandableText = ({
  content,
  className = "",
  maxLines = 3,
  fallbackText = "-",
}: FlowItemExpandableTextProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const textContent = content || fallbackText
  const contentId = useId()

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    // 当处于折叠状态或初次挂载时，检测实际 scrollHeight 是否超过 clientHeight
    const hasOverflow = el.scrollHeight > el.clientHeight + 1
    setIsOverflowing(hasOverflow)
  }, [textContent, maxLines])

  // 处理在展开后再次检查或尺寸变更
  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el || typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(() => {
      if (!isExpanded && el) {
        setIsOverflowing(el.scrollHeight > el.clientHeight + 1)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [isExpanded])

  const lineClampStyle: React.CSSProperties = isExpanded
    ? {}
    : {
        display: "-webkit-box",
        WebkitLineClamp: maxLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }

  return (
    <div className="agent-flow-expandable-text flex flex-col items-start gap-1">
      <div
        id={contentId}
        ref={contentRef}
        style={lineClampStyle}
        className={`leading-relaxed break-all whitespace-pre-wrap ${className}`}
      >
        {textContent}
      </div>

      {(isOverflowing || isExpanded) && (
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={(e) => {
            e.stopPropagation()
            setIsExpanded((prev) => !prev)
          }}
          className="inline-flex cursor-pointer items-center border-0 bg-transparent p-0 text-[11px] font-medium text-sky-400/90 transition-colors hover:text-sky-300 select-none focus:outline-none"
        >
          <span className="italic underline underline-offset-2">
            {isExpanded ? t("common.collapse") : `...${t("common.more")}`}
          </span>
        </button>
      )}
    </div>
  )
}
