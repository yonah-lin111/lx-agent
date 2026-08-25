import type React from "react"
import { useMemo } from "react"
import { sanitizeGraphicContent } from "./sanitizeVisual"

export interface SvgVisualContentProps {
  svg?: string
  className?: string
}

/**
 * SvgVisualContent - render_svg 专用独立渲染组件
 */
export const SvgVisualContent = ({
  svg,
  className = "",
}: SvgVisualContentProps): React.JSX.Element | null => {
  const sanitizedSvg = useMemo(() => {
    if (!svg || typeof svg !== "string") return ""
    return sanitizeGraphicContent(svg)
  }, [svg])

  if (!sanitizedSvg) return null

  return (
    <div
      className={`agent-visual-svg my-1.5 max-h-[80vh] overflow-auto rounded-[6px] border border-white/10 bg-[#0d0d0d] p-2.5 text-[12px] text-white/85 select-text custom-scrollbar ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
    />
  )
}
