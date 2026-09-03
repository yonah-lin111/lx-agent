import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { sanitizeHtmlDocument } from "./sanitizeVisual"

export interface HtmlVisualContentProps {
  html?: string
  className?: string
}

/**
 * HtmlVisualContent - render_html 专用独立渲染组件（基于独立沙箱 Iframe，自动编译注入 Tailwind CSS 规则）
 */
export const HtmlVisualContent = ({
  html,
  className = "",
}: HtmlVisualContentProps): React.JSX.Element | null => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeHeight, setIframeHeight] = useState<number>(200)
  const [compiledCss, setCompiledCss] = useState<string>("")

  // 调用主进程 Tailwind CSS 编译器，静态生成所需完整 CSS 样式
  useEffect(() => {
    if (!html || typeof html !== "string") {
      setCompiledCss("")
      return
    }

    let isCancelled = false
    void agentApi.compileTailwind(html).then((css) => {
      if (!isCancelled) {
        setCompiledCss(css)
      }
    })

    return () => {
      isCancelled = true
    }
  }, [html])

  const sanitizedHtmlDoc = useMemo(() => {
    if (!html || typeof html !== "string") return ""
    const baseDoc = sanitizeHtmlDocument(html)
    if (!compiledCss) return baseDoc

    // 将编译好的 Tailwind CSS 作为独立 <style> 注入 head 头部，并重置 min-h-screen/100vh 为适合内联预览的适配值
    const resetOverrides = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        min-height: 0 !important;
        height: auto !important;
        overflow-x: hidden !important;
      }
      body {
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: flex-start !important;
        padding: 24px 16px !important;
        box-sizing: border-box !important;
      }
    `
    const styleTag = `<style id="lx-tailwind-generated">${compiledCss}\n${resetOverrides}</style>`
    if (baseDoc.includes("</head>")) {
      return baseDoc.replace("</head>", `${styleTag}</head>`)
    }
    return `${styleTag}${baseDoc}`
  }, [html, compiledCss])

  const updateHeight = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const win = iframe.contentWindow
      const doc = iframe.contentDocument || win?.document
      if (doc && doc.body) {
        // 计算真实内容高度，避免负定位或绝对定位元素虚高影响
        let maxBottom = 0
        for (const child of Array.from(doc.body.children)) {
          if (child.tagName === "STYLE" || child.tagName === "SCRIPT") continue
          const rect = (child as HTMLElement).getBoundingClientRect?.()
          if (rect) {
            maxBottom = Math.max(maxBottom, (child as HTMLElement).offsetTop + rect.height)
          }
        }
        const naturalHeight = Math.max(
          maxBottom > 0 ? maxBottom + 32 : 0,
          doc.body.scrollHeight,
          doc.documentElement.scrollHeight,
          100,
        )
        setIframeHeight(naturalHeight)
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
      className={`agent-visual-html my-1.5 max-h-[80vh] w-full overflow-x-hidden overflow-y-auto rounded-[6px] border border-white/10 bg-[#0d0d0d] select-text custom-scrollbar ${className}`}
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
