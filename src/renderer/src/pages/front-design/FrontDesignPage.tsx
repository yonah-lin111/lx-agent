import {
  Check,
  ChevronDown,
  Copy,
  Eraser,
  FolderOpen,
  GitBranch,
  Laptop,
  MousePointerClick,
  Palette,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { generateElementSelector } from "@/features/agent/utils/designSynthesizer"
import { useTranslation } from "@/i18n"

type ViewportMode = "desktop" | "tablet" | "mobile"
export type FrontDesignPageTheme = "system" | "light" | "dark"

const FRONT_DESIGN_THEME_KEY = "lx_front_design_theme"

/**
 * 获取本地持久化的设计页面主题，默认为 system
 */
const getInitialDesignTheme = (): FrontDesignPageTheme => {
  try {
    const saved = localStorage.getItem(FRONT_DESIGN_THEME_KEY) as FrontDesignPageTheme | null
    if (saved === "light" || saved === "dark" || saved === "system") {
      return saved
    }
  } catch {
    // ignore
  }
  return "system"
}

/**
 * FrontDesignPage - Agent 前端设计看板。
 * 聚焦渲染当前激活的 Agent 前端原型，提供刷新、深色/浅色/跟随系统主题切换、视口切换、DevTools 与代码复制能力。
 */
export const FrontDesignPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { success: successToast } = useLxAgentToast()
  const designState = useFrontDesign()

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [viewport, setViewport] = useState<ViewportMode>("desktop")
  const [pageTheme, setPageTheme] = useState<FrontDesignPageTheme>(getInitialDesignTheme)
  const [copied, setCopied] = useState<boolean>(false)
  const [refreshKey, setRefreshKey] = useState<number>(0)

  // 监听系统深浅色偏好（用于 system 模式计算实际色彩模式）
  const [isSystemDark, setIsSystemDark] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
    }
    return true
  })

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = (e: MediaQueryListEvent): void => setIsSystemDark(e.matches)
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  // 计算当前画布的实际显式模式：light 或 dark
  const effectiveMode = useMemo<"light" | "dark">(() => {
    if (pageTheme === "system") {
      return isSystemDark ? "dark" : "light"
    }
    return pageTheme
  }, [pageTheme, isSystemDark])

  const handleSelectTheme = useCallback((nextTheme: FrontDesignPageTheme) => {
    setPageTheme(nextTheme)
    try {
      localStorage.setItem(FRONT_DESIGN_THEME_KEY, nextTheme)
    } catch {
      // ignore
    }
  }, [])

  const { html, activeDesignId, mode, sessionId, isStreaming } = designState

  const availableVersions = useMemo(() => {
    if (!activeDesignId) return []
    return frontDesignStore.getDesignVersions(activeDesignId)
  }, [activeDesignId, designState.designs, designState.updatedAt])

  const [isInspectorActive, setIsInspectorActive] = useState<boolean>(false)

  // 当画布清空、无激活设计或 Agent 正在流式生成时自动退出微调模式
  useEffect(() => {
    if (!html || !activeDesignId || isStreaming) {
      setIsInspectorActive(false)
    }
  }, [html, activeDesignId, isStreaming])

  // Shift + Alt 快捷键切换元素点选模式（Toggle，同时支持按 ESC 键或点击工具栏按钮退出）
  const handleShortcutKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isShiftOrAlt = e.key === "Shift" || e.key === "Alt"
      if (!isShiftOrAlt || !e.shiftKey || !e.altKey) return
      // 流式输出中或无激活设计时静默忽略
      if (isStreaming || !html || !activeDesignId) return

      // 防误触保护：若当前输入焦点位于 input、textarea 或可编辑元素内，则忽略
      const target =
        (e.target as HTMLElement | null) || (document.activeElement as HTMLElement | null)
      if (target) {
        const tagName = target.tagName?.toLowerCase()
        if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
          return
        }
      }

      setIsInspectorActive((prev) => !prev)
    },
    [isStreaming, html, activeDesignId],
  )

  // 全局主窗口监听 Shift + Alt
  useEffect(() => {
    window.addEventListener("keydown", handleShortcutKeyDown)
    return () => window.removeEventListener("keydown", handleShortcutKeyDown)
  }, [handleShortcutKeyDown])

  // 全局 ESC 键监听退出点选模式
  useEffect(() => {
    if (!isInspectorActive) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setIsInspectorActive(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isInspectorActive])

  // 画布检查器 (Inspector Mode)：在 iframe 内注入高亮浮层与点击监听
  useEffect(() => {
    if (!isInspectorActive) return
    const iframe = iframeRef.current
    if (!iframe) return

    let doc: Document | null = null
    try {
      doc = iframe.contentDocument
    } catch {
      // 跨域防御
    }
    if (!doc || !doc.body) return

    const overlayId = "lx-design-inspector-overlay"
    let overlay = doc.getElementById(overlayId) as HTMLElement | null
    if (!overlay) {
      overlay = doc.createElement("div")
      overlay.id = overlayId
      overlay.style.position = "fixed"
      overlay.style.pointerEvents = "none"
      overlay.style.zIndex = "2147483647"
      overlay.style.border = "2px solid #ec4899"
      overlay.style.backgroundColor = "rgba(236, 72, 153, 0.12)"
      overlay.style.borderRadius = "4px"
      overlay.style.display = "none"
      overlay.style.boxSizing = "border-box"
      overlay.style.transition = "all 0.05s ease-out"

      const badge = doc.createElement("div")
      badge.id = `${overlayId}-badge`
      badge.style.position = "absolute"
      badge.style.top = "-24px"
      badge.style.left = "0px"
      badge.style.backgroundColor = "#ec4899"
      badge.style.color = "#ffffff"
      badge.style.fontSize = "11px"
      badge.style.fontWeight = "600"
      badge.style.padding = "2px 6px"
      badge.style.borderRadius = "3px"
      badge.style.whiteSpace = "nowrap"
      badge.style.pointerEvents = "none"
      badge.style.fontFamily = "ui-monospace, monospace"
      badge.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)"
      overlay.appendChild(badge)

      doc.body.appendChild(overlay)
    }

    const prevCursor = doc.body.style.cursor
    doc.body.style.cursor = "crosshair"

    let currentHovered: HTMLElement | null = null

    const handleMouseMove = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (
        !target ||
        target === overlay ||
        target === doc!.body ||
        target === doc!.documentElement
      ) {
        if (overlay) overlay.style.display = "none"
        currentHovered = null
        return
      }

      currentHovered = target
      const rect = target.getBoundingClientRect()
      if (overlay) {
        overlay.style.display = "block"
        overlay.style.top = `${rect.top}px`
        overlay.style.left = `${rect.left}px`
        overlay.style.width = `${rect.width}px`
        overlay.style.height = `${rect.height}px`

        const badge = overlay.firstElementChild as HTMLElement | null
        if (badge) {
          const tagName = target.tagName.toLowerCase()
          const id = target.id ? `#${target.id}` : ""
          const dims = `${Math.round(rect.width)}×${Math.round(rect.height)}`
          badge.textContent = `${tagName}${id} | ${dims}`
          if (rect.top < 26) {
            badge.style.top = "2px"
            badge.style.left = "2px"
          } else {
            badge.style.top = "-24px"
            badge.style.left = "0px"
          }
        }
      }
    }

    const handleMouseLeave = (): void => {
      if (overlay) overlay.style.display = "none"
      currentHovered = null
    }

    const handleClick = async (e: MouseEvent): Promise<void> => {
      e.preventDefault()
      e.stopPropagation()

      const target = currentHovered || (e.target as HTMLElement | null)
      if (
        !target ||
        target === overlay ||
        target === doc!.body ||
        target === doc!.documentElement
      ) {
        return
      }

      // 移除 overlay 避免序列化进入快照
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay)
      }

      const { selector, description, injectedAttr } = generateElementSelector(target)

      // 如果动态挂载了 data-design-id，同步刷回 frontDesignStore 保证选择器 100% 精确命中
      if (injectedAttr && activeDesignId) {
        let fullHtml = doc!.documentElement.outerHTML
        if (!/<!doctype\s+html/i.test(fullHtml)) {
          fullHtml = `<!DOCTYPE html>\n${fullHtml}`
        }
        frontDesignStore.registerDesign({
          id: activeDesignId,
          parentId: designState.parentId,
          title: designState.title,
          html: fullHtml,
          sessionId,
          mode,
        })
      }

      // 将 overlay 放回 doc.body 继续支持后续点选
      if (overlay && doc && doc.body) {
        doc.body.appendChild(overlay)
      }

      const cleanSelector = selector.startsWith("#") ? selector.slice(1) : selector
      const mentionToken = `@design:${activeDesignId}#${cleanSelector} (${description}) `

      let targetTabId = agentTabStore.getActiveTabId()
      if (sessionId) {
        const targetTab = agentTabStore.findTabBySessionId(sessionId)
        if (targetTab) {
          targetTabId = targetTab.id
        }
      }

      await agentApi
        .setCollaborationMode("design", sessionId ?? undefined, targetTabId)
        .catch(() => {})
      agentTabStore.insertPromptToActiveTab(mentionToken)

      // 轻量 Toast 提示回填成功，保持点选模式允许连续点选
      successToast(t("frontDesign.elementSelectedToast", { name: description }))
    }

    const handleDocKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setIsInspectorActive(false)
      }
    }

    doc.addEventListener("mousemove", handleMouseMove, true)
    doc.addEventListener("mouseleave", handleMouseLeave, true)
    doc.addEventListener("click", handleClick, true)
    doc.addEventListener("keydown", handleDocKeyDown, true)

    return () => {
      try {
        if (doc) {
          doc.removeEventListener("mousemove", handleMouseMove, true)
          doc.removeEventListener("mouseleave", handleMouseLeave, true)
          doc.removeEventListener("click", handleClick, true)
          doc.removeEventListener("keydown", handleDocKeyDown, true)
          if (doc.body) {
            doc.body.style.cursor = prevCursor
          }
          const el = doc.getElementById(overlayId)
          if (el && el.parentNode) {
            el.parentNode.removeChild(el)
          }
        }
      } catch {
        // ignore
      }
    }
  }, [
    isInspectorActive,
    activeDesignId,
    designState.parentId,
    designState.title,
    sessionId,
    mode,
    successToast,
    t,
  ])

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
  const sanitizedHtmlDoc = useMemo(() => {
    if (!html || typeof html !== "string") return ""
    const baseDoc = sanitizeHtmlDocument(html, { allowScripts: true })

    const colorSchemeCss =
      effectiveMode === "dark"
        ? ":root { color-scheme: dark; } html { color-scheme: dark; background-color: #0b0f19; color: #f3f4f6; }"
        : ":root { color-scheme: light; } html { color-scheme: light; background-color: #ffffff; color: #111827; }"

    const resetOverrides = `
      ${colorSchemeCss}
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        min-height: 100% !important;
        height: 100% !important;
        box-sizing: border-box !important;
      }
    `
    const styleTag = `<style id="lx-front-design-theme-override">${resetOverrides}</style>`
    const twStyleTag = compiledTailwindCss
      ? `<style id="lx-front-design-tailwind-compiled">${compiledTailwindCss}</style>`
      : ""
    const sandboxGuardScript = `<script id="lx-sandbox-guard">try{Object.defineProperty(window,'parent',{get:()=>null,set:()=>{},configurable:false});Object.defineProperty(window,'top',{get:()=>null,set:()=>{},configurable:false});Object.defineProperty(window,'frameElement',{get:()=>null,set:()=>{},configurable:false});Object.defineProperty(window,'opener',{get:()=>null,set:()=>{},configurable:false});if('electron' in window){try{delete window.electron;}catch(e){}}window.open=()=>null;}catch(e){}</script>`
    let docWithTheme = baseDoc

    // 根据模式为 <html> 标签注入或移除 dark 类名
    if (effectiveMode === "dark") {
      if (docWithTheme.includes("<html")) {
        docWithTheme = docWithTheme.replace(
          /<html([^>]*)class=["']([^"']*)["']/i,
          '<html$1class="$2 dark"',
        )
        if (!docWithTheme.includes('class="') && !docWithTheme.includes("class='")) {
          docWithTheme = docWithTheme.replace(/<html/i, '<html class="dark"')
        }
      }
    } else {
      docWithTheme = docWithTheme.replace(/\bdark\b/g, "")
    }

    const injectedHead = `${sandboxGuardScript}\n${styleTag}\n${twStyleTag}`
    if (docWithTheme.includes("</head>")) {
      return docWithTheme.replace("</head>", `${injectedHead}</head>`)
    }
    return `${injectedHead}${docWithTheme}`
  }, [html, effectiveMode, compiledTailwindCss])

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

  // 跨作用域将 Shift + Alt 监听挂载到 iframe 内部文档
  const attachIframeKeydown = useCallback(() => {
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (doc) {
        doc.removeEventListener("keydown", handleShortcutKeyDown, true)
        doc.addEventListener("keydown", handleShortcutKeyDown, true)
      }
    } catch {
      // 跨域防御
    }
  }, [handleShortcutKeyDown])

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

        // 1. 同步 html 根节点 class 与暗色模式
        if (parsed.documentElement && doc.documentElement) {
          if (doc.documentElement.className !== parsed.documentElement.className) {
            doc.documentElement.className = parsed.documentElement.className
          }
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

        // 4. 平滑替换 body 结构（保留可能存在的 inspector overlay）
        const overlay = doc.getElementById("lx-design-inspector-overlay")
        const newBodyHtml = parsed.body?.innerHTML || ""
        if (doc.body.innerHTML !== newBodyHtml) {
          doc.body.innerHTML = newBodyHtml
          if (overlay) {
            doc.body.appendChild(overlay)
          }
          if (!isStreamingRef.current) {
            executeIframeScripts(doc)
          }
        }
      } catch {
        // 忽略异常
      }
    },
    [executeIframeScripts],
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
  }, [isStreaming, executeIframeScripts])

  const handleIframeLoad = useCallback(() => {
    attachIframeKeydown()
    const iframe = iframeRef.current
    if (iframe?.contentDocument && !isStreamingRef.current) {
      executeIframeScripts(iframe.contentDocument)
    }
    if (sanitizedHtmlDocRef.current) {
      updateIframeContent(sanitizedHtmlDocRef.current)
    }
  }, [attachIframeKeydown, executeIframeScripts, updateIframeContent])

  useEffect(() => {
    attachIframeKeydown()
  }, [attachIframeKeydown, refreshKey, activeDesignId])

  const handleCopy = useCallback(async () => {
    if (!html) return
    try {
      await navigator.clipboard.writeText(html)
      setCopied(true)
      successToast(t("frontDesign.copySuccess"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 忽略
    }
  }, [html, successToast, t])

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  const handleOpenDesignDirectory = useCallback(async () => {
    if (!sessionId || !activeDesignId) return
    await agentApi.openDesignDir(sessionId, activeDesignId)
  }, [sessionId, activeDesignId])

  const viewportWidthClass = useMemo(() => {
    switch (viewport) {
      case "mobile":
        return "max-w-[375px]"
      case "tablet":
        return "max-w-[768px]"
      default:
        return "max-w-full"
    }
  }, [viewport])

  const isDesktop = viewport === "desktop"
  const showEmptyDesign = !html
  const isFullBleed = isDesktop && !showEmptyDesign

  const THEME_OPTIONS: { id: FrontDesignPageTheme; label: string }[] = [
    { id: "system", label: t("frontDesign.themeSystem") },
    { id: "light", label: t("frontDesign.themeLight") },
    { id: "dark", label: t("frontDesign.themeDark") },
  ]

  const inspectorTooltipContent = useMemo(() => {
    if (isStreaming) {
      return t("frontDesign.generating")
    }
    return (
      <div className="flex flex-col gap-1 text-xs">
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-white/90">
            {isInspectorActive ? t("frontDesign.inspectModeActive") : t("frontDesign.inspectMode")}
          </span>
        </div>
        <div className="border-t border-white/10 pt-1 text-[11px] text-white/45">
          {t("frontDesign.inspectShortcutHint")}
        </div>
      </div>
    )
  }, [isStreaming, isInspectorActive, t])

  return (
    <div
      className="front-design-page flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5"
      style={{ backgroundColor: "var(--color-theme-surface)" }}
    >
      {/* 顶部控制工具栏：左侧刷新，右侧主题、视口、DevTools 与复制代码 */}
      {/* 顶部控制工具栏：左侧【版本与模式】、中间【视口切换】、右侧【工具与操作】 */}
      <header
        className="flex h-11 shrink-0 items-center justify-between gap-3 border-b px-3"
        style={{
          backgroundColor: "var(--color-theme-surface-hover)",
          borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))",
        }}
      >
        {/* 左侧：版本、模式与刷新 */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          {html && (
            <span className="front-design-badge shrink-0 rounded border border-pink-500/20 bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-medium text-pink-300">
              {mode === "css" ? t("frontDesign.pureCssMode") : t("frontDesign.tailwindMode")}
            </span>
          )}

          {/* 版本指示与切换器：若有多版本则显示下拉菜单，单版本时显示当前版本号静态徽标 */}
          {availableVersions.length > 1 ? (
            <LxTooltip
              click={{
                content: (
                  <div className="version-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[110px]">
                    {availableVersions.map((v) => {
                      const isSelected = v.id === activeDesignId
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => frontDesignStore.setActiveDesignId(v.id)}
                          className={`version-menu-option flex w-full cursor-pointer items-center justify-between gap-2 rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
                            isSelected
                              ? "bg-white/10 font-semibold text-white"
                              : "text-white/70 hover:bg-white/5 hover:text-white"
                          }`}
                        >
                          <span className="flex items-center gap-1.5">
                            <GitBranch className="h-3 w-3 opacity-60" />
                            {t("frontDesign.versionBadge", { version: v.version ?? 1 })}
                          </span>
                          {isSelected && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                        </button>
                      )
                    })}
                  </div>
                ),
                placement: "bottom",
                closeOnContentClick: true,
              }}
            >
              <button
                type="button"
                className="flex items-center gap-1 rounded border border-pink-500/30 bg-pink-500/15 px-1.5 py-0.5 text-[10px] font-medium text-pink-300 hover:bg-pink-500/25 transition-colors cursor-pointer"
                aria-label={t("frontDesign.selectVersion")}
              >
                <GitBranch className="h-3 w-3" />
                <span>v{designState.version ?? 1}</span>
                <ChevronDown className="h-3 w-3 opacity-70" />
              </button>
            </LxTooltip>
          ) : activeDesignId && html ? (
            <span className="flex items-center gap-1 rounded border border-pink-500/20 bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-mono font-medium text-pink-300 select-none">
              <GitBranch className="h-3 w-3 opacity-70" />
              <span>v{designState.version ?? 1}</span>
            </span>
          ) : null}

          <LxIconButton
            size="small"
            onClick={handleRefresh}
            aria-label={t("frontDesign.refreshPreview")}
            title={{ content: t("frontDesign.refreshPreview"), placement: "bottom" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>

        {/* 中间：视口预设切换（桌面 / 平板 / 移动） */}
        <div className="flex shrink-0 items-center justify-center">
          <div
            className="flex items-center rounded-[6px] p-0.5 border"
            style={{
              backgroundColor: "var(--color-theme-bg)",
              borderColor: "var(--color-theme-border, rgba(255, 255, 255, 0.05))",
            }}
          >
            <LxIconButton
              size="small"
              highlighted={viewport === "desktop"}
              onClick={() => setViewport("desktop")}
              aria-label={t("frontDesign.viewportDesktop")}
              title={{ content: t("frontDesign.viewportDesktop"), placement: "bottom" }}
            >
              <Laptop className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxIconButton
              size="small"
              highlighted={viewport === "tablet"}
              onClick={() => setViewport("tablet")}
              aria-label={t("frontDesign.viewportTablet")}
              title={{ content: t("frontDesign.viewportTablet"), placement: "bottom" }}
            >
              <Tablet className="h-3.5 w-3.5" />
            </LxIconButton>
            <LxIconButton
              size="small"
              highlighted={viewport === "mobile"}
              onClick={() => setViewport("mobile")}
              aria-label={t("frontDesign.viewportMobile")}
              title={{ content: t("frontDesign.viewportMobile"), placement: "bottom" }}
            >
              <Smartphone className="h-3.5 w-3.5" />
            </LxIconButton>
          </div>
        </div>

        {/* 右侧：工具与操作 */}
        <div className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
          {/* 点选微调 Inspector */}
          {activeDesignId && html && (
            <LxIconButton
              size="small"
              disabled={isStreaming}
              highlighted={isInspectorActive}
              onClick={() => setIsInspectorActive((prev) => !prev)}
              aria-label={t("frontDesign.inspectMode")}
              title={{
                content: inspectorTooltipContent,
                placement: "bottom",
              }}
            >
              <MousePointerClick className="h-3.5 w-3.5" />
            </LxIconButton>
          )}

          <div
            className="h-3.5 w-[1px] mx-0.5"
            style={{ backgroundColor: "var(--color-theme-border, rgba(255, 255, 255, 0.1))" }}
          />

          {/* 打开工程目录 */}
          {sessionId && activeDesignId && (
            <LxIconButton
              size="small"
              onClick={handleOpenDesignDirectory}
              aria-label={t("frontDesign.openDesignDir")}
              title={{ content: t("frontDesign.openDesignDir"), placement: "bottom" }}
            >
              <FolderOpen className="h-3.5 w-3.5" />
            </LxIconButton>
          )}

          {/* 设计页面主题切换（复刻 HeaderSideBar Palette 图标风格） */}
          <LxTooltip
            hover={{
              content: t("frontDesign.theme"),
              placement: "bottom",
            }}
            click={{
              content: (
                <div className="theme-menu-dropdown flex flex-col gap-0.5 py-0.5 min-w-[95px]">
                  {THEME_OPTIONS.map((opt) => {
                    const isSelected = pageTheme === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectTheme(opt.id)}
                        className={`theme-menu-option flex w-full cursor-pointer items-center justify-between gap-3 rounded-[4px] px-2 py-1 text-left text-xs transition-colors ${
                          isSelected
                            ? "bg-white/10 font-semibold text-white"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {isSelected && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                      </button>
                    )
                  })}
                </div>
              ),
              placement: "bottom",
              closeOnContentClick: true,
            }}
          >
            <LxIconButton aria-label={t("frontDesign.theme")} size="small">
              <Palette className="h-3.5 w-3.5" />
            </LxIconButton>
          </LxTooltip>

          <div
            className="h-3.5 w-[1px] mx-0.5"
            style={{ backgroundColor: "var(--color-theme-border, rgba(255, 255, 255, 0.1))" }}
          />

          {/* 复制代码 */}
          <LxIconButton
            size="small"
            disabled={!html}
            onClick={handleCopy}
            aria-label={t("frontDesign.copyCode")}
            title={{ content: t("frontDesign.copyCode"), placement: "bottom" }}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </LxIconButton>

          {/* 清空画布 */}
          <LxIconButton
            size="small"
            disabled={!activeDesignId && !html}
            onClick={() => frontDesignStore.setActiveDesignId(null)}
            aria-label={t("frontDesign.clearCanvas")}
            title={{ content: t("frontDesign.clearCanvas"), placement: "bottom" }}
          >
            <Eraser className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      </header>

      {/* 主画布预览区 */}
      <main
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto ${
          isFullBleed ? "p-0" : "p-4"
        } ${showEmptyDesign ? "front-design-empty-canvas" : ""}`}
        style={{ backgroundColor: "var(--color-theme-bg)" }}
      >
        {showEmptyDesign ? (
          <div className="front-design-empty-container flex max-w-sm flex-col items-center justify-center gap-3 text-center">
            <div className="front-design-empty-icon flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Palette className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="front-design-empty-title text-sm font-semibold text-white/80">
                {t("frontDesign.emptyTitle")}
              </h2>
              <p className="front-design-empty-desc text-xs text-white/45 leading-relaxed">
                {t("frontDesign.emptyDesc")}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`flex h-full w-full ${viewportWidthClass} flex-col overflow-hidden ${
              isDesktop
                ? "rounded-none border-none shadow-none"
                : "rounded-[6px] border border-white/10 shadow-2xl"
            } transition-[max-width] duration-300 ease-in-out`}
            style={{ backgroundColor: "var(--color-theme-surface)" }}
          >
            {/* 统一使用高性能沙箱 iframe，保持单一上下文，流式与落盘零白屏切换。配置 allow-scripts 确保原型脚本正常执行 */}
            <iframe
              key={currentKey}
              ref={iframeRef}
              srcDoc={cachedSrcDoc}
              onLoad={handleIframeLoad}
              sandbox="allow-scripts allow-same-origin"
              title={t("frontDesign.title") || "Front Design Preview"}
              className={`h-full w-full border-none ${
                effectiveMode === "dark" ? "bg-[#0b0f19]" : "bg-white"
              }`}
            />
          </div>
        )}
      </main>
    </div>
  )
}
