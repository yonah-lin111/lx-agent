import {
  Check,
  Copy,
  Eraser,
  FolderOpen,
  Laptop,
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
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
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
 * 判断当前是否处于测试/jsdom环境（单测降级为 iframe）
 */
const isTestEnvironment =
  typeof (globalThis as { process?: { env?: Record<string, string> } }).process !== "undefined" &&
  ((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.NODE_ENV ===
    "test" ||
    (globalThis as { process?: { env?: Record<string, string> } }).process?.env?.VITEST === "true")

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
    const baseDoc = sanitizeHtmlDocument(html)

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

    const injectedHead = `${styleTag}\n${twStyleTag}`
    if (docWithTheme.includes("</head>")) {
      return docWithTheme.replace("</head>", `${injectedHead}</head>`)
    }
    return `${injectedHead}${docWithTheme}`
  }, [html, effectiveMode, compiledTailwindCss])

  // 流式更新优化：保持 iframe 稳定，通过 contentDocument 进行无闪烁热更新
  const lastRenderedHtmlRef = useRef<string>("")
  const isUpdatingIframeRef = useRef<boolean>(false)
  const [initialIframeDoc, setInitialIframeDoc] = useState<string>("")

  // 当 activeDesignId 切换或主题模式切换时，重置初始骨架文档
  useEffect(() => {
    lastRenderedHtmlRef.current = ""
    setInitialIframeDoc(sanitizedHtmlDoc)
  }, [activeDesignId, effectiveMode, refreshKey])

  // 将实时编译的 Tailwind CSS 注入到当前 iframe 中
  useEffect(() => {
    if (!compiledTailwindCss) return
    const iframe = iframeRef.current
    if (!iframe) return
    try {
      const doc = iframe.contentDocument
      if (doc && doc.head) {
        let twStyle = doc.getElementById("lx-front-design-tailwind-compiled")
        if (!twStyle) {
          twStyle = doc.createElement("style")
          twStyle.id = "lx-front-design-tailwind-compiled"
          doc.head.appendChild(twStyle)
        }
        twStyle.textContent = compiledTailwindCss
      }
    } catch {
      // ignore
    }
  }, [compiledTailwindCss])

  useEffect(() => {
    if (!sanitizedHtmlDoc) return
    const iframe = iframeRef.current
    if (!iframe) return

    // 在实际运行环境中，通过 contentDocument 增量更新避免白屏
    if (!isTestEnvironment) {
      try {
        const doc = iframe.contentDocument
        if (doc && doc.body) {
          // 如果 iframe 已经初始化，且处于流式渲染，使用 rAF 进行无白屏平滑更新
          if (lastRenderedHtmlRef.current) {
            if (!isUpdatingIframeRef.current) {
              isUpdatingIframeRef.current = true
              requestAnimationFrame(() => {
                isUpdatingIframeRef.current = false
                try {
                  const currentDoc = iframe.contentDocument
                  if (!currentDoc) return
                  const parser = new DOMParser()
                  const parsed = parser.parseFromString(sanitizedHtmlDoc, "text/html")

                  // 平滑同步 body 结构，不重建 window，彻底消除白屏
                  currentDoc.body.innerHTML = parsed.body?.innerHTML || ""

                  // 同步 dark 模式类名
                  if (parsed.documentElement) {
                    currentDoc.documentElement.className = parsed.documentElement.className
                  }

                  // 确保主题与重置样式生效
                  const existingStyle = currentDoc.getElementById("lx-front-design-theme-override")
                  const newStyle = parsed.getElementById("lx-front-design-theme-override")
                  if (newStyle && existingStyle) {
                    existingStyle.textContent = newStyle.textContent
                  }
                } catch {
                  // 出错退回
                }
              })
            }
            return
          }
        }
      } catch {
        // 忽略跨域等异常
      }
    }

    lastRenderedHtmlRef.current = sanitizedHtmlDoc
  }, [sanitizedHtmlDoc, isStreaming])

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

  return (
    <div
      className="front-design-page flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5"
      style={{ backgroundColor: "var(--color-theme-surface)" }}
    >
      {/* 顶部控制工具栏：左侧刷新，右侧主题、视口、DevTools 与复制代码 */}
      <header
        className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/5 px-3"
        style={{ backgroundColor: "var(--color-theme-surface-hover)" }}
      >
        {/* 左侧：刷新操作与设计模式徽标 */}
        <div className="flex items-center gap-2">
          <LxIconButton
            size="small"
            onClick={handleRefresh}
            aria-label={t("frontDesign.refreshPreview")}
            title={{ content: t("frontDesign.refreshPreview"), placement: "bottom" }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </LxIconButton>

          {html && (
            <span className="rounded bg-pink-500/10 border border-pink-500/20 px-1.5 py-0.5 text-[10px] font-medium text-pink-300">
              {mode === "css" ? t("frontDesign.pureCssMode") : t("frontDesign.tailwindMode")}
            </span>
          )}
        </div>

        {/* 右侧：主题切换、视口切换、开发者工具与复制代码 */}
        <div className="flex items-center gap-1.5 shrink-0">
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

          <div className="h-3.5 w-[1px] bg-white/10 mx-0.5" />

          {/* 视口预设 */}
          <div
            className="flex items-center rounded-[5px] p-0.5 border border-white/5"
            style={{ backgroundColor: "var(--color-theme-bg)" }}
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

          <div className="h-3.5 w-[1px] bg-white/10 mx-0.5" />

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
        </div>
      </header>

      {/* 主画布预览区 */}
      <main
        className={`flex min-h-0 flex-1 items-center justify-center overflow-auto ${
          isFullBleed ? "p-0" : "p-4"
        }`}
        style={{ backgroundColor: "var(--color-theme-bg)" }}
      >
        {showEmptyDesign ? (
          <div className="flex max-w-sm flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <Palette className="h-6 w-6" />
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-semibold text-white/80">{t("frontDesign.emptyTitle")}</h2>
              <p className="text-xs text-white/45 leading-relaxed">{t("frontDesign.emptyDesc")}</p>
            </div>
          </div>
        ) : (
          <div
            className={`flex h-full w-full ${viewportWidthClass} flex-col overflow-hidden ${
              isDesktop
                ? "rounded-none border-none shadow-none"
                : "rounded-[8px] border border-white/10 shadow-2xl"
            } transition-[max-width] duration-300 ease-in-out`}
            style={{ backgroundColor: "var(--color-theme-surface)" }}
          >
            {/* 统一使用高性能沙箱 iframe，保持单一上下文，流式与落盘零白屏切换。移除 allow-scripts 消除安全逃逸告警 */}
            <iframe
              key={`${activeDesignId || "empty"}-${effectiveMode}-${refreshKey}`}
              ref={iframeRef}
              srcDoc={isTestEnvironment ? sanitizedHtmlDoc : initialIframeDoc || sanitizedHtmlDoc}
              sandbox="allow-same-origin"
              title="Front Design Preview"
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
