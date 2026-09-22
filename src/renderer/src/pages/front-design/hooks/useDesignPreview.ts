import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { buildPreviewDocument } from "@/pages/front-design/utils/previewDocument"

export interface UseDesignPreviewOptions {
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  html: string
  mode?: "tailwindcss" | "css"
  effectiveMode: "light" | "dark"
  isStreaming: boolean
  activeDesignId: string | null
  sessionId: string | null
  refreshKey: number
  // iframe 加载完成后的附加回调（如 Inspector 快捷键挂载）。
  onIframeLoad?: () => void
}

export interface UseDesignPreviewResult {
  // 单次挂载时稳定的初始 srcDoc（仅设计/主题/刷新变化时更新）。
  cachedSrcDoc: string
  // iframe key：设计切换、主题切换或手动刷新时强制重建。
  currentKey: string
  handleIframeLoad: () => void
}

/**
 * 双向同步元素属性（class/lang/style 等），供 iframe 增量更新时保持根节点属性一致。
 */
export const syncElementAttributes = (target: Element, source: Element): void => {
  for (const attr of Array.from(target.attributes)) {
    if (!source.hasAttribute(attr.name)) target.removeAttribute(attr.name)
  }
  for (const attr of Array.from(source.attributes)) {
    if (target.getAttribute(attr.name) !== attr.value) {
      target.setAttribute(attr.name, attr.value)
    }
  }
}

/**
 * 设计预览域：Tailwind 编译、沙箱文档构建、iframe 平滑增量更新与落盘同步。
 */
export const useDesignPreview = ({
  iframeRef,
  html,
  mode,
  effectiveMode,
  isStreaming,
  activeDesignId,
  sessionId,
  refreshKey,
  onIframeLoad,
}: UseDesignPreviewOptions): UseDesignPreviewResult => {
  // 异步编译 Tailwind CSS 并动态注入到 iframe 中，完全避免跨域外部脚本与 CSP 违规
  const [compiledTailwindCss, setCompiledTailwindCss] = useState<string>("")
  const latestHtmlRef = useRef<string>("")
  latestHtmlRef.current = html

  useEffect(() => {
    if (!html || mode === "css") {
      setCompiledTailwindCss("")
      return
    }

    let isMounted = true
    const timer = setTimeout(() => {
      void agentApi.compileTailwind(html).then((css) => {
        if (isMounted && latestHtmlRef.current === html) {
          setCompiledTailwindCss(css)
        }
      })
    }, 150) // 150ms 防抖，兼顾流式打字与 CPU 编译开销

    return () => {
      isMounted = false
      clearTimeout(timer)
    }
  }, [html, mode])

  // 确保当 activeDesign 存在且尚未落盘时，自动补齐落盘，以便 lx-design:// 协议正确加载
  useEffect(() => {
    if (!sessionId || !activeDesignId || !html || isStreaming) return
    void agentApi.saveFrontDesign({
      sessionId,
      designId: activeDesignId,
      html,
      mode: mode ?? "tailwindcss",
    })
  }, [sessionId, activeDesignId, html, mode, refreshKey, isStreaming])

  // 构建注入 Tailwind 样式和主题类后的完整 HTML 沙箱文档
  const sanitizedHtmlDoc = useMemo(
    () => buildPreviewDocument(html, { effectiveMode, compiledTailwindCss }),
    [html, effectiveMode, compiledTailwindCss],
  )

  // 保持单次挂载时稳定的初始 srcDoc，仅在设计项切换、主题模式切换或手动刷新时更新
  // 流式期间不更新 srcDoc，彻底消除浏览器重新导航 iframe 导致的白屏闪烁
  const currentKey = `${activeDesignId || "empty"}-${effectiveMode}-${refreshKey}`
  const prevKeyRef = useRef<string>(currentKey)
  const [cachedSrcDoc, setCachedSrcDoc] = useState<string>(sanitizedHtmlDoc)

  if (prevKeyRef.current !== currentKey) {
    prevKeyRef.current = currentKey
    setCachedSrcDoc(sanitizedHtmlDoc)
  } else if (!cachedSrcDoc && sanitizedHtmlDoc) {
    setCachedSrcDoc(sanitizedHtmlDoc)
  }

  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming

  // 在沙箱内实例化并执行原型 script 标签，同时补齐派发 DOMContentLoaded
  const executeIframeScripts = useCallback((doc: Document) => {
    try {
      const scripts = Array.from(doc.body.querySelectorAll("script"))
      for (const oldScript of scripts) {
        if (oldScript.id === "lx-sandbox-guard") continue
        const newScript = doc.createElement("script")
        Array.from(oldScript.attributes).forEach((attr) => {
          newScript.setAttribute(attr.name, attr.value)
        })
        newScript.textContent = oldScript.textContent
        oldScript.parentNode?.replaceChild(newScript, oldScript)
      }
      doc.dispatchEvent(new Event("DOMContentLoaded"))
    } catch {
      // 忽略沙箱脚本执行异常
    }
  }, [])

  // 高性能平滑局部增量更新 iframe DOM
  const updateIframeContent = useCallback(
    (docContent: string) => {
      const iframe = iframeRef.current
      if (!iframe) return
      try {
        const doc = iframe.contentDocument
        if (!doc || !doc.body) return

        const parser = new DOMParser()
        const parsed = parser.parseFromString(docContent, "text/html")

        // 1. 同步 html 与 body 根节点属性（class/lang/style 等，含布局与主题类）
        if (parsed.documentElement && doc.documentElement) {
          syncElementAttributes(doc.documentElement, parsed.documentElement)
        }
        if (parsed.body && doc.body) {
          syncElementAttributes(doc.body, parsed.body)
        }

        // 2. 同步 head 关键样式覆盖
        const syncStyle = (id: string) => {
          const newStyle = parsed.getElementById(id)
          let currentStyle = doc.getElementById(id)
          if (newStyle) {
            if (!currentStyle) {
              currentStyle = doc.createElement("style")
              currentStyle.id = id
              doc.head?.appendChild(currentStyle)
            }
            if (currentStyle.textContent !== newStyle.textContent) {
              currentStyle.textContent = newStyle.textContent
            }
          }
        }

        syncStyle("lx-front-design-theme-override")
        syncStyle("lx-front-design-tailwind-compiled")

        // 3. 同步文档 head 自定义 style 节点
        const customStyles = parsed.querySelectorAll("style:not([id^='lx-front-design-'])")
        if (customStyles.length > 0) {
          const customContainerId = "lx-front-design-custom-styles"
          let container = doc.getElementById(customContainerId)
          if (!container) {
            container = doc.createElement("style")
            container.id = customContainerId
            doc.head?.appendChild(container)
          }
          const combinedCss = Array.from(customStyles)
            .map((s) => s.textContent || "")
            .join("\n")
          if (container.textContent !== combinedCss) {
            container.textContent = combinedCss
          }
        }

        // 4. 平滑替换 body 结构（保留批注图层，避免更新后钉选气泡丢失）
        const annotationLayer = doc.getElementById("lx-design-annotation-layer")
        const newBodyHtml = parsed.body?.innerHTML || ""
        if (doc.body.innerHTML !== newBodyHtml) {
          doc.body.innerHTML = newBodyHtml
          if (annotationLayer) {
            doc.body.appendChild(annotationLayer)
          }
          if (!isStreamingRef.current) {
            executeIframeScripts(doc)
          }
        }
      } catch {
        // 忽略异常
      }
    },
    [iframeRef, executeIframeScripts],
  )

  const rafIdRef = useRef<number | null>(null)
  const sanitizedHtmlDocRef = useRef<string>(sanitizedHtmlDoc)
  sanitizedHtmlDocRef.current = sanitizedHtmlDoc

  // 使用 requestAnimationFrame 对流式输出进行平滑合帧更新，彻底杜绝白屏与高频重绘闪烁
  useEffect(() => {
    if (!sanitizedHtmlDoc) return

    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current)
    }

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null
      updateIframeContent(sanitizedHtmlDoc)
    })

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [sanitizedHtmlDoc, updateIframeContent])

  // 流式结束时，同步完整 srcDoc 并触发沙箱内的原型脚本执行
  const prevStreamingRef = useRef(isStreaming)
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming) {
      if (sanitizedHtmlDocRef.current) {
        setCachedSrcDoc(sanitizedHtmlDocRef.current)
      }
      const iframe = iframeRef.current
      if (iframe?.contentDocument) {
        executeIframeScripts(iframe.contentDocument)
      }
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming, iframeRef, executeIframeScripts])

  const handleIframeLoad = useCallback(() => {
    onIframeLoad?.()
    const iframe = iframeRef.current
    if (iframe?.contentDocument && !isStreamingRef.current) {
      executeIframeScripts(iframe.contentDocument)
    }
    if (sanitizedHtmlDocRef.current) {
      updateIframeContent(sanitizedHtmlDocRef.current)
    }
  }, [iframeRef, onIframeLoad, executeIframeScripts, updateIframeContent])

  return { cachedSrcDoc, currentKey, handleIframeLoad }
}
