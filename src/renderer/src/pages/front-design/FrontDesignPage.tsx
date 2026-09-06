import { Check, Copy, Laptop, Loader2, Palette, RefreshCw, Smartphone, Tablet } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"
import { useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { useTranslation } from "@/i18n"

type ViewportMode = "desktop" | "tablet" | "mobile"

/**
 * FrontDesignPage - 前端设计模式独立看板主页面。
 * 容器与样式参考 render_html，支持 Tailwind JIT 实时编译与沙箱 Iframe 热更新预览。
 */
export const FrontDesignPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { success: successToast } = useLxAgentToast()
  const designState = useFrontDesign()

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [compiledCss, setCompiledCss] = useState<string>("")
  const [isCompiling, setIsCompiling] = useState<boolean>(false)
  const [viewport, setViewport] = useState<ViewportMode>("desktop")
  const [copied, setCopied] = useState<boolean>(false)
  const [refreshKey, setRefreshKey] = useState<number>(0)

  const { html, title, isStreaming } = designState

  // 编译 Tailwind CSS
  useEffect(() => {
    if (!html || typeof html !== "string") {
      setCompiledCss("")
      return
    }

    let isCancelled = false
    setIsCompiling(true)
    void agentApi
      .compileTailwind(html)
      .then((css) => {
        if (!isCancelled) {
          setCompiledCss(css)
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsCompiling(false)
        }
      })

    return () => {
      isCancelled = true
    }
  }, [html, refreshKey])

  // 构建注入 Tailwind 样式后的完整 HTML 沙箱文档
  const sanitizedHtmlDoc = useMemo(() => {
    if (!html || typeof html !== "string") return ""
    const baseDoc = sanitizeHtmlDocument(html)
    if (!compiledCss) return baseDoc

    const resetOverrides = `
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        min-height: 100% !important;
        height: 100% !important;
        box-sizing: border-box !important;
      }
    `
    const styleTag = `<style id="lx-tailwind-generated">${compiledCss}\n${resetOverrides}</style>`
    if (baseDoc.includes("</head>")) {
      return baseDoc.replace("</head>", `${styleTag}</head>`)
    }
    return `${styleTag}${baseDoc}`
  }, [html, compiledCss])

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

  return (
    <div
      className="front-design-page flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5"
      style={{ backgroundColor: "var(--color-theme-surface)" }}
    >
      {/* 顶部工具栏 */}
      <header
        className="flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-4"
        style={{ backgroundColor: "var(--color-theme-surface-hover)" }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-pink-500/10 text-pink-400">
            <Palette className="h-3.5 w-3.5" />
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-semibold text-xs text-white/90 truncate">
              {title || t("frontDesign.title")}
            </span>
            {isStreaming && (
              <span className="flex items-center gap-1 text-[11px] text-pink-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Streaming...</span>
              </span>
            )}
          </div>
        </div>

        {/* 视口切换与操作按扭 */}
        <div className="flex items-center gap-1.5">
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

          <div className="h-3.5 w-[1px] bg-white/10 mx-1" />

          {/* 刷新 */}
          <LxIconButton
            size="small"
            onClick={handleRefresh}
            aria-label={t("frontDesign.refreshPreview")}
            title={{ content: t("frontDesign.refreshPreview"), placement: "bottom" }}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isCompiling ? "animate-spin text-pink-400" : ""}`}
            />
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
        className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
        style={{ backgroundColor: "var(--color-theme-bg)" }}
      >
        {!html ? (
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
            className={`flex h-full w-full ${viewportWidthClass} flex-col overflow-hidden rounded-[8px] border border-white/10 shadow-2xl transition-[max-width] duration-300 ease-in-out`}
            style={{ backgroundColor: "var(--color-theme-surface)" }}
          >
            <iframe
              key={refreshKey}
              ref={iframeRef}
              srcDoc={sanitizedHtmlDoc}
              sandbox="allow-scripts allow-same-origin"
              title="Front Design Preview"
              className="h-full w-full border-none bg-transparent"
            />
          </div>
        )}
      </main>
    </div>
  )
}
