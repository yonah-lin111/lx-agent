import type React from "react"

export interface AsciiVisualContentProps {
  ascii?: string
  className?: string
}

/**
 * AsciiVisualContent - render_ascii 专用独立渲染组件
 */
export const AsciiVisualContent = ({
  ascii,
  className = "",
}: AsciiVisualContentProps): React.JSX.Element | null => {
  if (!ascii || typeof ascii !== "string") return null

  return (
    <div
      className={`agent-visual-ascii my-1.5 max-h-[80vh] overflow-auto rounded-[6px] border border-white/10 bg-[#0d0d0d] p-2.5 text-[12px] select-text custom-scrollbar ${className}`}
    >
      <pre className="font-mono text-[11px] leading-[1.25] text-sky-300/90 whitespace-pre m-0 p-0 bg-transparent border-0">
        {ascii}
      </pre>
    </div>
  )
}
