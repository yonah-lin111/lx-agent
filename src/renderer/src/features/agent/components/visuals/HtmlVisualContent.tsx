import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { sanitizeHtmlDocument } from "./sanitizeVisual"

export interface HtmlVisualContentProps {
  html?: string
  customStyle?: string
  className?: string
}

/**
 * HtmlVisualContent - render_html 专用独立渲染组件（基于独立沙箱 Iframe）
 */
export const HtmlVisualContent = ({
  html,
  customStyle,
  className = "",
}: HtmlVisualContentProps): React.JSX.Element | null => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(200)

  const sanitizedHtmlDoc = useMemo(() => {
    if (!html || typeof html !== "string") return ""
    return sanitizeHtmlDocument(html, customStyle)
  }, [html, customStyle])

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument || win?.document
      if (doc && doc.body) {
        const height = Math.max(
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight,
          doc.body.offsetHeight,
          doc.documentElement.offsetHeight,
          100,
        )
        setIframeHeight(height)
      }
    } catch {}
  }, [])

  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    updateHeight()

    let docObserver: ResizeObserver | null = null
    const attachObserver = (): void => {
      updateHeight()
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (doc && doc.body) {
          docObserver?.disconnect()
          docObserver = new ResizeObserver(() => updateHeight())
          docObserver.observe(doc.body)
          if (doc.documentElement) {
            docObserver.observe(doc.documentElement)
          }
        }
      } catch {}
    }

    iframe.addEventListener("load", attachObserver)
    // 立即尝试挂载一次
    attachObserver()

    // 延迟 50ms 与 200ms 二次校验，防止 CSS/字体渲染后尺寸发生变化
    const timer1 = setTimeout(updateHeight, 50)
    const timer2 = setTimeout(updateHeight, 200)

    return () => {
      iframe.removeEventListener("load", attachObserver)
      docObserver?.disconnect()
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [sanitizedHtmlDoc, updateHeight])

  if (!sanitizedHtmlDoc) return null

  return (
    <div
      className={`agent-visual-html my-1.5 max-h-[80vh] w-full overflow-x-hidden overflow-y-auto rounded-[6px] border border-white/10 bg-[#0d0d0d] py-3.5 select-text custom-scrollbar flex items-center justify-center ${className}`}
    >
      <iframe
        ref={iframeRef}
        srcDoc={sanitizedHtmlDoc}
        sandbox="allow-scripts allow-same-origin"
        scrolling="no"
        title="HTML Preview"
        onLoad={updateHeight}
        style={{
          width: "100%",
          height: `${iframeHeight}px`,
          maxHeight: "none",
          border: "none",
          display: "block",
          background: "transparent",
          overflow: "hidden",
        }}
      />
    </div>
  )
}
