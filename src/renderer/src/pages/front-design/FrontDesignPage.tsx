import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { useTranslation } from "@/i18n"
import { FrontDesignCanvas } from "@/pages/front-design/components/FrontDesignCanvas"
import { FrontDesignToolbar } from "@/pages/front-design/components/FrontDesignToolbar"
import { useDesignInspector } from "@/pages/front-design/hooks/useDesignInspector"
import { useDesignPreview } from "@/pages/front-design/hooks/useDesignPreview"
import { useDesignTheme } from "@/pages/front-design/hooks/useDesignTheme"
import type { ViewportMode } from "@/pages/front-design/types"

/**
 * FrontDesignPage - Agent 前端设计看板。
 * 聚焦渲染当前激活的 Agent 前端原型，提供刷新、深色/浅色/跟随系统主题切换、视口切换、Inspector 点选与代码复制能力。
 */
export const FrontDesignPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { success: successToast, error: errorToast } = useLxAgentToast()
  const designState = useFrontDesign()

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [viewport, setViewport] = useState<ViewportMode>("desktop")
  const [copied, setCopied] = useState<boolean>(false)
  const [refreshKey, setRefreshKey] = useState<number>(0)
  const [isExporting, setIsExporting] = useState<boolean>(false)

  const { pageTheme, setPageTheme, effectiveMode } = useDesignTheme()

  const { html, activeDesignId, mode, sessionId, isStreaming } = designState

  const availableVersions = useMemo(() => {
    if (!activeDesignId) return []
    return frontDesignStore.getDesignVersions(activeDesignId)
  }, [activeDesignId, designState.designs, designState.updatedAt])

  const { isInspectorActive, setIsInspectorActive, attachIframeKeydown } = useDesignInspector({
    iframeRef,
    html,
    activeDesignId,
    sessionId,
    title: designState.title,
    parentId: designState.parentId,
    mode,
    isStreaming,
  })

  const { cachedSrcDoc, currentKey, handleIframeLoad } = useDesignPreview({
    iframeRef,
    html,
    mode,
    effectiveMode,
    isStreaming,
    activeDesignId,
    sessionId,
    refreshKey,
    onIframeLoad: attachIframeKeydown,
  })

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

  const handleExportPng = useCallback(async () => {
    if (!sessionId || !activeDesignId || !html || isExporting) return
    setIsExporting(true)
    try {
      const result = await agentApi.exportDesignPng({
        sessionId,
        designId: activeDesignId,
        viewport,
        theme: effectiveMode,
      })
      if (result.ok && result.path) {
        successToast(t("frontDesign.exportPngSuccess", { path: result.path }))
      } else {
        errorToast(result.error || t("frontDesign.exportPngFailed"))
      }
    } catch (err) {
      errorToast(err instanceof Error ? err.message : t("frontDesign.exportPngFailed"))
    } finally {
      setIsExporting(false)
    }
  }, [
    sessionId,
    activeDesignId,
    html,
    isExporting,
    viewport,
    effectiveMode,
    successToast,
    errorToast,
    t,
  ])

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

  return (
    <div
      className="front-design-page flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5"
      style={{ backgroundColor: "var(--color-theme-surface)" }}
    >
      <FrontDesignToolbar
        mode={mode}
        hasHtml={Boolean(html)}
        version={designState.version ?? 1}
        availableVersions={availableVersions}
        activeDesignId={activeDesignId}
        onSelectVersion={frontDesignStore.setActiveDesignId}
        onClearCanvas={() => frontDesignStore.setActiveDesignId(null)}
        onRefresh={handleRefresh}
        viewport={viewport}
        onViewportChange={setViewport}
        isStreaming={isStreaming}
        isInspectorActive={isInspectorActive}
        onToggleInspector={() => setIsInspectorActive((prev) => !prev)}
        sessionId={sessionId}
        onOpenDesignDir={handleOpenDesignDirectory}
        onCopy={handleCopy}
        copied={copied}
        pageTheme={pageTheme}
        onSelectTheme={setPageTheme}
        onExportPng={handleExportPng}
        isExporting={isExporting}
      />
      <FrontDesignCanvas
        hasHtml={Boolean(html)}
        viewportWidthClass={viewportWidthClass}
        isDesktop={isDesktop}
        effectiveMode={effectiveMode}
        iframeRef={iframeRef}
        cachedSrcDoc={cachedSrcDoc}
        currentKey={currentKey}
        onIframeLoad={handleIframeLoad}
      />
    </div>
  )
}
