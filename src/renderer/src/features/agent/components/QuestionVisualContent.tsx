import type React from "react"
import { AsciiVisualContent, HtmlVisualContent, SvgVisualContent } from "./visuals"

export interface QuestionVisualContentProps {
  content?: string
  customStyle?: string
  className?: string
}

/**
 * QuestionVisualContent - 根据 question.content 自动识别格式并分发到对应独立内容组件
 */
export const QuestionVisualContent = ({
  content,
  customStyle,
  className = "",
}: QuestionVisualContentProps): React.JSX.Element | null => {
  if (!content) return null

  const trimmed = content.trim()
  const isSvg =
    trimmed.startsWith("<svg") || (trimmed.startsWith("<?xml") && trimmed.includes("<svg"))
  if (isSvg) {
    return <SvgVisualContent svg={content} className={className} />
  }

  const isHtml = /<[a-z][\s\S]*>/i.test(content)
  if (isHtml) {
    return <HtmlVisualContent html={content} customStyle={customStyle} className={className} />
  }

  return <AsciiVisualContent ascii={content} className={className} />
}
