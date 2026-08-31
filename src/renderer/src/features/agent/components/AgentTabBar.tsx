import type { AgentSessionSummary } from "@shared/contracts/agent"
import { Bot, ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { agentApi } from "../api/agentApi"
import { type AgentTab, agentTabStore } from "../hooks/agentTabStore"
import { sessionListStore } from "../hooks/sessionListStore"

/**
 * AgentTabBar - 顶部横向 Agent 标签页栏
 * 放置在 RightSidebar 顶部（QA/Flow 视图切换按钮与折叠按钮之间），
 * 支持标签页横向滚动、左右切换翻页、滚轮滚动、新建 Tab、关闭 Tab 二次确认与富信息 Tooltip。
 */
export const AgentTabBar = (): React.JSX.Element => {
  const { t } = useTranslation()
  const { warning } = useLxToast()

  const tabs = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getTabs)
  const activeTabId = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getActiveTabId)
  const streamingMap = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getStreamingMap)
  const sessions = useSyncExternalStore(sessionListStore.subscribe, sessionListStore.getSessions)

  const tabScrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollState = useCallback((): void => {
    const el = tabScrollRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setCanScrollLeft(scrollLeft > 2)
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 2)
  }, [])

  useEffect(() => {
    const el = tabScrollRef.current
    if (!el) return

    updateScrollState()

    const onScroll = (): void => updateScrollState()
    const onWheel = (event: WheelEvent): void => {
      if (!event.deltaY) return
      event.preventDefault()
      el.scrollLeft += event.deltaY
    }

    el.addEventListener("scroll", onScroll, { passive: true })
    el.addEventListener("wheel", onWheel, { passive: false })

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => updateScrollState()) : null
    observer?.observe(el)

    return () => {
      el.removeEventListener("scroll", onScroll)
      el.removeEventListener("wheel", onWheel)
      observer?.disconnect()
    }
  }, [tabs.length, updateScrollState])

  const handleTabScroll = useCallback((direction: "left" | "right"): void => {
    const el = tabScrollRef.current
    if (!el) return
    el.scrollBy({ left: direction === "left" ? -120 : 120, behavior: "smooth" })
  }, [])

  const handleCreateTab = useCallback(() => {
    const createdId = agentTabStore.createTab()
    if (!createdId) {
      warning(t("agent.maxTabsReached"))
    }
  }, [warning, t])

  const handleCloseTab = useCallback(
    (event: React.MouseEvent, tabId: string) => {
      event.stopPropagation()
      if (tabs.length <= 1) {
        warning(t("agent.cannotCloseLastTab"))
        return
      }
      agentTabStore.closeTab(tabId)
    },
    [tabs.length, warning, t],
  )

  const getTabLabel = (index: number, sessionId: string | null, title?: string): string => {
    if (title && title.trim()) return title.trim()
    if (sessionId) {
      const session = sessions.find((s) => s.id === sessionId)
      if (session?.title) return session.title
    }
    return t("agent.tabNumber", { number: index + 1 })
  }

  const renderTabTooltip = (index: number, tab: AgentTab, session?: AgentSessionSummary) => {
    const isStreaming = Boolean(streamingMap[tab.id])
    const title =
      (tab.title && tab.title.trim()) ||
      session?.title ||
      t("agent.tabNumber", { number: index + 1 })
    const timeStr = session?.updatedAt
      ? new Date(session.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : undefined

    return (
      <div className="flex min-w-[150px] max-w-[240px] flex-col gap-1 py-0.5 text-[11px] font-sans">
        <div className="font-semibold text-white truncate">{title}</div>
        <div className="flex items-center gap-1.5 text-white/65 text-[10px]">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
            }`}
          />
          <span>{isStreaming ? t("agent.statusRunning") : t("agent.statusReady")}</span>
        </div>
        {session?.cwd && (
          <div className="truncate text-white/40 font-mono text-[10px]">{session.cwd}</div>
        )}
        {timeStr && <div className="text-white/30 text-[10px]">{timeStr}</div>}
      </div>
    )
  }

  return (
    <div className="agent-tab-bar flex h-6 min-w-0 flex-1 items-center gap-0.5 overflow-hidden px-0.5 select-none">
      {/* 左翻页按钮 */}
      {canScrollLeft && (
        <LxIconButton
          size="small"
          aria-label={t("project.scrollLeft")}
          onClick={() => handleTabScroll("left")}
          className="shrink-0 text-white/50 hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </LxIconButton>
      )}

      {/* 横向滚动标签容器 */}
      <div
        ref={tabScrollRef}
        className="scrollbar-hidden flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId
          const isStreaming = Boolean(streamingMap[tab.id])
          const session = tab.sessionId ? sessions.find((s) => s.id === tab.sessionId) : undefined
          const label = getTabLabel(index, tab.sessionId, tab.title)

          return (
            <div key={tab.id} className="group relative flex shrink-0 items-center">
              <LxTooltip
                hover={{
                  content: renderTabTooltip(index, tab, session),
                  placement: "bottom",
                }}
              >
                <button
                  type="button"
                  onClick={() => agentTabStore.switchTab(tab.id)}
                  aria-selected={isActive}
                  className={`flex h-6 max-w-[130px] items-center gap-1.5 rounded-[6px] px-2 text-xs transition-all duration-150 cursor-pointer ${
                    isStreaming
                      ? isActive
                        ? "bg-amber-500/20 text-amber-200 font-medium ring-1 ring-amber-500/50 shadow-sm"
                        : "bg-amber-500/10 text-amber-300/80 ring-1 ring-amber-500/25 hover:bg-amber-500/15"
                      : isActive
                        ? "bg-[var(--color-theme-surface-active,rgba(255,255,255,0.12))] text-[var(--color-theme-text-primary,#fff)] font-medium ring-1 ring-white/10 shadow-sm"
                        : "text-[var(--color-theme-text-secondary,#888)] hover:bg-[var(--color-theme-surface-hover,rgba(255,255,255,0.06))] hover:text-white/90"
                  }`}
                >
                  {isStreaming ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-400" />
                  ) : (
                    <Bot
                      className={`h-3.5 w-3.5 shrink-0 ${
                        isActive ? "text-[var(--color-theme-accent,#38bdf8)]" : "text-white/40"
                      }`}
                    />
                  )}
                  <span className="min-w-0 truncate font-mono text-[11px] leading-none">
                    {label}
                  </span>
                  {tabs.length > 1 &&
                    (isStreaming ? (
                      <LxTooltip
                        click={{
                          content: (
                            <div className="p-1 text-xs leading-relaxed max-w-[200px]">
                              {t("agent.closeTabConfirmGenerating")}
                            </div>
                          ),
                          placement: "bottom",
                        }}
                        onConfirm={() => {
                          agentApi.abort(tab.sessionId ?? undefined, tab.id)
                          agentTabStore.closeTab(tab.id)
                        }}
                      >
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={t("agent.closeTab")}
                          className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] opacity-70 hover:opacity-100 hover:bg-white/15 text-amber-300 hover:text-red-400 transition-all cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </LxTooltip>
                    ) : (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => handleCloseTab(e, tab.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            handleCloseTab(e as any, tab.id)
                          }
                        }}
                        aria-label={t("agent.closeTab")}
                        className="ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] opacity-40 hover:opacity-100 hover:bg-white/15 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    ))}
                </button>
              </LxTooltip>
            </div>
          )
        })}

        {/* 添加新 Tab 按钮 */}
        <LxIconButton
          size="small"
          disabled={tabs.length >= 8}
          onClick={handleCreateTab}
          aria-label={t("agent.newTab")}
          title={{ content: t("agent.newTab"), placement: "bottom" }}
          className="shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
        </LxIconButton>
      </div>

      {/* 右翻页按钮 */}
      {canScrollRight && (
        <LxIconButton
          size="small"
          aria-label={t("project.scrollRight")}
          onClick={() => handleTabScroll("right")}
          className="shrink-0 text-white/50 hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </LxIconButton>
      )}
    </div>
  )
}
