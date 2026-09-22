import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { buildIssueReviewMessage } from "@/features/agent/utils/designReviewComposer"
import { useTranslation } from "@/i18n"
import { FrontDesignAnnotationsPanel } from "@/pages/front-design/components/FrontDesignAnnotationsPanel"
import { FrontDesignCanvas } from "@/pages/front-design/components/FrontDesignCanvas"
import { FrontDesignComparePane } from "@/pages/front-design/components/FrontDesignComparePane"
import { FrontDesignIssuesPanel } from "@/pages/front-design/components/FrontDesignIssuesPanel"
import { FrontDesignToolbar } from "@/pages/front-design/components/FrontDesignToolbar"
import { useDesignAnnotations } from "@/pages/front-design/hooks/useDesignAnnotations"
import { useDesignChecks } from "@/pages/front-design/hooks/useDesignChecks"
import { useDesignPreview } from "@/pages/front-design/hooks/useDesignPreview"
import { useDesignTheme } from "@/pages/front-design/hooks/useDesignTheme"
import type { ViewportMode } from "@/pages/front-design/types"
import { pickDefaultCompareDesign } from "@/pages/front-design/utils/compareSelection"

/**
 * FrontDesignPage - Agent 前端设计看板。
 * 聚焦渲染激活的前端原型，提供版本切换、版本对照、视口预设、画布批注评审与体检回流。
 */
export const FrontDesignPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { success: successToast } = useLxToast()
  const designState = useFrontDesign()

  const iframeRef = useRef<HTMLIFrameElement>(null)

  const [viewport, setViewport] = useState<ViewportMode>("desktop")
  const [copied, setCopied] = useState<boolean>(false)
  const [refreshKey, setRefreshKey] = useState<number>(0)
  // 版本对照：null 表示关闭，非 null 为对照窗当前展示的版本 id。
  const [compareDesignId, setCompareDesignId] = useState<string | null>(null)

  const { pageTheme, setPageTheme, effectiveMode } = useDesignTheme()

  const { html, activeDesignId, mode, sessionId, title, isStreaming } = designState

  const annotations = useDesignAnnotations({
    iframeRef,
    html,
    activeDesignId,
    sessionId,
    title,
    parentId: designState.parentId,
    mode,
    isStreaming,
  })

  const checks = useDesignChecks({
    iframeRef,
    activeDesignId,
    hasHtml: Boolean(html),
    isStreaming,
    refreshKey,
  })

  const availableVersions = useMemo(() => {
    if (!activeDesignId) return []
    return frontDesignStore.getDesignVersions(activeDesignId)
  }, [activeDesignId, designState.designs, designState.updatedAt])

  const canCompare = availableVersions.length > 1

  // 对照窗当前版本：解析失败时由 effect 回落到默认候选。
  const compareDesign = useMemo(() => {
    if (!compareDesignId) return null
    return availableVersions.find((item) => item.id === compareDesignId) ?? null
  }, [compareDesignId, availableVersions])

  // 主画布切版本 / 版本族变化导致对照目标失效时自动重选，无候选则关闭对照。
  useEffect(() => {
    if (!compareDesignId) return
    const isValid = availableVersions.some(
      (item) => item.id === compareDesignId && item.id !== activeDesignId,
    )
    if (isValid) return
    setCompareDesignId(pickDefaultCompareDesign(availableVersions, activeDesignId))
  }, [compareDesignId, availableVersions, activeDesignId])

  const handleToggleCompare = useCallback(() => {
    setCompareDesignId((prev) =>
      prev ? null : pickDefaultCompareDesign(availableVersions, activeDesignId),
    )
  }, [availableVersions, activeDesignId])

  // iframe 每次加载完成后重建批注图层并触发审计，确保图层与运行时文档同源。
  const handleDesignRuntime = useCallback(() => {
    annotations.attachIframeRuntime()
    checks.scheduleAudit()
  }, [annotations, checks])

  const { cachedSrcDoc, currentKey, handleIframeLoad } = useDesignPreview({
    iframeRef,
    html,
    mode,
    effectiveMode,
    isStreaming,
    activeDesignId,
    sessionId,
    refreshKey,
    onIframeLoad: handleDesignRuntime,
  })

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

  // 体检问题回流：勾选项编译为设计级 mention + 编号清单，写入聊天输入框。
  const handleSendIssues = useCallback(async () => {
    const targets = checks.selectedIssues
    if (targets.length === 0 || !activeDesignId) return

    const message = buildIssueReviewMessage({
      designId: activeDesignId,
      title,
      issues: targets,
      header: t("frontDesign.issuesMessageHeader", { count: targets.length }),
    })
    if (!message) return

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
    agentTabStore.insertPromptToActiveTab(message)
    checks.clearSelection()
    successToast(t("frontDesign.issuesPanelSentToast", { count: targets.length }))
  }, [checks, activeDesignId, title, sessionId, t, successToast])

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
  const showAnnotationsPanel = annotations.isInspectorActive || annotations.annotations.length > 0

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
        isInspectorActive={annotations.isInspectorActive}
        onToggleInspector={() => annotations.setIsInspectorActive((prev) => !prev)}
        compareOpen={Boolean(compareDesign)}
        canCompare={canCompare}
        onToggleCompare={handleToggleCompare}
        sessionId={sessionId}
        onOpenDesignDir={handleOpenDesignDirectory}
        onCopy={handleCopy}
        copied={copied}
        pageTheme={pageTheme}
        onSelectTheme={setPageTheme}
      />

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 min-w-0 flex-1">
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

            {compareDesign && (
              <FrontDesignComparePane
                design={compareDesign}
                options={availableVersions.filter((item) => item.id !== activeDesignId)}
                viewportWidthClass={viewportWidthClass}
                isDesktop={isDesktop}
                effectiveMode={effectiveMode}
                onSelectVersion={setCompareDesignId}
                onClose={() => setCompareDesignId(null)}
              />
            )}
          </div>
          {Boolean(html) && (
            <FrontDesignIssuesPanel
              issues={checks.issues}
              runtimeCount={checks.runtimeCount}
              a11yCount={checks.a11yCount}
              isStreaming={isStreaming}
              isOpen={checks.isPanelOpen}
              onOpenChange={checks.setIsPanelOpen}
              selectedIds={checks.selectedIds}
              isAllSelected={checks.isAllSelected}
              onToggleIssue={checks.toggleIssue}
              onToggleAll={checks.toggleAll}
              onRerun={checks.rerun}
              onSend={handleSendIssues}
            />
          )}
        </div>

        {showAnnotationsPanel && Boolean(html) && (
          <FrontDesignAnnotationsPanel
            annotations={annotations.annotations}
            onSend={annotations.sendAnnotations}
            onEdit={annotations.editAnnotation}
            onRemove={annotations.removeAnnotation}
            onClear={annotations.clearAnnotations}
            onHighlight={annotations.highlightAnnotation}
          />
        )}
      </div>
    </div>
  )
}
