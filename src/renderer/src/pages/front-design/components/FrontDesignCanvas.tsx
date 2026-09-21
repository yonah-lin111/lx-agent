import { Palette } from "lucide-react"
import type React from "react"
import { useTranslation } from "@/i18n"

export interface FrontDesignCanvasProps {
  hasHtml: boolean
  viewportWidthClass: string
  isDesktop: boolean
  effectiveMode: "light" | "dark"
  iframeRef: React.RefObject<HTMLIFrameElement | null>
  cachedSrcDoc: string
  currentKey: string
  onIframeLoad: () => void
}

/**
 * FrontDesignCanvas - 设计画布主区域：空状态提示与沙箱 iframe 预览。
 */
export const FrontDesignCanvas = ({
  hasHtml,
  viewportWidthClass,
  isDesktop,
  effectiveMode,
  iframeRef,
  cachedSrcDoc,
  currentKey,
  onIframeLoad,
}: FrontDesignCanvasProps): React.JSX.Element => {
  const { t } = useTranslation()

  const isFullBleed = isDesktop && hasHtml

  return (
    <main
      className={`relative flex min-h-0 flex-1 items-center justify-center overflow-auto ${
        isFullBleed ? "p-0" : "p-4"
      } ${hasHtml ? "" : "front-design-empty-canvas"}`}
      style={{ backgroundColor: "var(--color-theme-bg)" }}
    >
      {!hasHtml ? (
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
            onLoad={onIframeLoad}
            sandbox="allow-scripts allow-same-origin"
            title={t("frontDesign.title") || "Front Design Preview"}
            className={`h-full w-full border-none ${
              effectiveMode === "dark" ? "bg-[#0b0f19]" : "bg-white"
            }`}
          />
        </div>
      )}
    </main>
  )
}
