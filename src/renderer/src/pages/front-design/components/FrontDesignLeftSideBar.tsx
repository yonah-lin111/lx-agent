import { ChevronDown, Loader2, Palette, Search, Trash2 } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { type AgentTab, agentTabStore } from "@/features/agent/hooks/agentTabStore"
import {
  type FrontDesignItem,
  frontDesignStore,
  useFrontDesign,
} from "@/features/agent/hooks/frontDesignStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { useTranslation } from "@/i18n"

export interface FrontDesignLeftSideBarProps {
  isCollapsed?: boolean
}

interface DesignFamilyGroup {
  root: FrontDesignItem
  versions: FrontDesignItem[]
  isCurrentActive: boolean
}

interface TabWithDesigns {
  tab: AgentTab
  tabLabel: string
  isStreaming: boolean
  designs: FrontDesignItem[]
  designGroups: DesignFamilyGroup[]
}

/**
 * 渲染前端设计页面专属左侧栏内容：
 * 同步展示 AgentTabBar 的各 Tab 及其下属的所有 FrontDesignCard 原型，
 * 层级结构与交互参考 ProjectNavigationList。
 */
export const FrontDesignLeftSideBar = ({
  isCollapsed = false,
}: FrontDesignLeftSideBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { designs, activeDesignId } = useFrontDesign()

  const tabs = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getTabs)
  const activeTabId = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getActiveTabId)
  const streamingMap = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getStreamingMap)
  const sessions = useSyncExternalStore(sessionListStore.subscribe, sessionListStore.getSessions)

  // 搜索关键字与折叠状态
  const [searchKeyword, setSearchKeyword] = useState<string>("")
  const [collapsedTabs, setCollapsedTabs] = useState<Record<string, boolean>>({})

  // 计算 Tab 标题
  const getTabLabel = useCallback(
    (tab: AgentTab, index: number): string => {
      if (tab.title?.trim()) return tab.title.trim()
      if (tab.sessionId) {
        const session = sessions.find((s) => s.id === tab.sessionId)
        if (session?.title?.trim()) return session.title.trim()
      }
      return t("agent.tabNumber", { number: index + 1 })
    },
    [sessions, t],
  )

  // 聚合各 Tab 与对应会话下的前端设计列表
  const tabsWithDesigns = useMemo<TabWithDesigns[]>(() => {
    const keyword = searchKeyword.trim().toLowerCase()

    return tabs.map((tab, index) => {
      const tabLabel = getTabLabel(tab, index)
      const isStreaming = Boolean(streamingMap[tab.id])

      // 匹配属于该 Tab 会话的设计项（草稿 Tab 匹配无 sessionId 的设计项）
      let tabDesigns = designs.filter((d) => {
        if (tab.sessionId) {
          return d.sessionId === tab.sessionId || (!d.sessionId && tab.id === activeTabId)
        }
        return !d.sessionId && tab.id === activeTabId
      })

      // 按生成时间升序排序
      tabDesigns.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))

      // 搜索关键词过滤
      if (keyword) {
        const isTabNameMatched = tabLabel.toLowerCase().includes(keyword)
        if (!isTabNameMatched) {
          tabDesigns = tabDesigns.filter((d) => {
            const title = (d.title || t("frontDesign.title")).toLowerCase()
            return title.includes(keyword)
          })
        }
      }

      // 聚合设计族：将同一版本树下的所有版本折叠在根设计下
      const roots = tabDesigns.filter((d) => {
        if (!d.parentId) return true
        return !tabDesigns.some((parent) => parent.id === d.parentId)
      })

      const designGroups: DesignFamilyGroup[] = (roots.length > 0 ? roots : tabDesigns).map(
        (root) => {
          const allVersions = frontDesignStore.getDesignVersions(root.id)
          const versions = allVersions.length > 0 ? allVersions : [root]
          const isCurrentActive = versions.some((v) => v.id === activeDesignId)
          return {
            root,
            versions,
            isCurrentActive,
          }
        },
      )

      return {
        tab,
        tabLabel,
        isStreaming,
        designs: tabDesigns,
        designGroups,
      }
    })
  }, [tabs, designs, activeTabId, activeDesignId, streamingMap, getTabLabel, searchKeyword, t])

  // 搜索时仅展示匹配到设计的 Tab 或 Tab 名称命中的 Tab
  const visibleTabsWithDesigns = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return tabsWithDesigns

    return tabsWithDesigns.filter((item) => {
      const isTabNameMatched = item.tabLabel.toLowerCase().includes(keyword)
      return isTabNameMatched || item.designs.length > 0
    })
  }, [tabsWithDesigns, searchKeyword])

  // 所有可见设计项总数
  const totalVisibleDesigns = useMemo(() => {
    return visibleTabsWithDesigns.reduce((acc, item) => acc + item.designs.length, 0)
  }, [visibleTabsWithDesigns])

  // 扁平化可见设计列表（供折叠视图使用）
  const allVisibleDesigns = useMemo(() => {
    return visibleTabsWithDesigns.flatMap((item) => item.designs)
  }, [visibleTabsWithDesigns])

  // 当已有激活项从列表中被删除时，重置激活项
  useEffect(() => {
    if (!activeDesignId) return

    const exists = designs.some((d) => d.id === activeDesignId)
    if (!exists) {
      frontDesignStore.setActiveDesignId(designs[0]?.id ?? null)
    }
  }, [designs, activeDesignId])

  // 切换折叠状态
  const handleToggleTab = useCallback((tabId: string) => {
    setCollapsedTabs((prev) => ({
      ...prev,
      [tabId]: !prev[tabId],
    }))
  }, [])

  // 点击 Tab 节点：仅负责折叠与展开，绝不打开/激活设计
  const handleTabClick = useCallback(
    (tabId: string) => {
      handleToggleTab(tabId)
    },
    [handleToggleTab],
  )

  // 点击设计项节点：激活该设计项，并自动将 AgentTabBar 切换到所属 Tab
  const handleDesignClick = useCallback(
    (design: FrontDesignItem, tabId: string) => {
      frontDesignStore.setActiveDesignId(design.id)
      if (tabId !== activeTabId) {
        agentTabStore.switchTab(tabId)
      }
    },
    [activeTabId],
  )

  // 侧边栏折叠模式（仅展示图标）
  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2">
          {allVisibleDesigns.map((d) => {
            const isActive = d.id === activeDesignId
            return (
              <LxIconButton
                key={d.id}
                highlighted={isActive}
                onClick={() => {
                  frontDesignStore.setActiveDesignId(d.id)
                  if (d.sessionId) {
                    const targetTab = agentTabStore.findTabBySessionId(d.sessionId)
                    if (targetTab && targetTab.id !== activeTabId) {
                      agentTabStore.switchTab(targetTab.id)
                    }
                  }
                }}
                aria-label={d.title || t("frontDesign.title")}
                title={{ content: d.title || t("frontDesign.title"), placement: "right" }}
              >
                {d.isStreaming ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-400" />
                ) : (
                  <Palette className={`h-3.5 w-3.5 ${isActive ? "text-pink-400" : ""}`} />
                )}
              </LxIconButton>
            )
          })}
        </nav>
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-2">
      {/* 头部导航与标题：左侧留出折叠按钮安全间隙 (pl-7)，右侧居右对齐操作区 */}
      <div className="flex h-7 shrink-0 items-center justify-between pl-7 pr-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-white/80 truncate">
            {t("frontDesign.historyList")}
          </span>
          <span className="rounded-[4px] bg-white/10 px-1.5 py-0.2 text-[10px] text-white/50 shrink-0 font-mono">
            {totalVisibleDesigns}
          </span>
        </div>
        {designs.length > 0 && (
          <LxIconButton
            size="small"
            onClick={() => frontDesignStore.clear()}
            aria-label={t("frontDesign.clearHistory")}
            title={{ content: t("frontDesign.clearHistory"), placement: "bottom" }}
          >
            <Trash2 className="h-3.5 w-3.5 text-white/40 hover:text-red-400" />
          </LxIconButton>
        )}
      </div>

      {/* 顶部搜索框 */}
      <div className="px-1">
        <LxInput
          type="text"
          value={searchKeyword}
          placeholder={t("frontDesign.searchDesigns")}
          aria-label={t("frontDesign.searchDesigns")}
          prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/25" />}
          size="sm"
          onChange={(e) => setSearchKeyword(e.target.value)}
          clear
        />
      </div>

      {/* 树形列表内容 */}
      <div className="custom-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-1 pb-2 [scrollbar-gutter:stable]">
        {visibleTabsWithDesigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-white/35">
            {designs.length === 0
              ? t("frontDesign.noDesigns")
              : searchKeyword.trim()
                ? t("frontDesign.noMatchingDesigns")
                : t("frontDesign.noDesignsInSession")}
          </div>
        ) : (
          visibleTabsWithDesigns.map((item) => {
            const isTabActive = item.tab.id === activeTabId
            const isTabCollapsed = searchKeyword ? false : Boolean(collapsedTabs[item.tab.id])

            return (
              <div key={item.tab.id} className="space-y-0.5">
                {/* 父级：Tab 节点（参考 ProjectNavigationList 的 Project 节点视觉与排版） */}
                <div
                  role="button"
                  tabIndex={0}
                  data-item-level="tab"
                  aria-expanded={!isTabCollapsed}
                  aria-current={isTabActive ? "true" : undefined}
                  onClick={() => handleTabClick(item.tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      handleTabClick(item.tab.id)
                    }
                  }}
                  className={`group flex h-7 items-center gap-1.5 rounded-[6px] px-1.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 cursor-pointer ${
                    isTabActive
                      ? "bg-white/10 text-white font-medium shadow-sm"
                      : "text-white/70 hover:bg-white/5"
                  }`}
                >
                  {/* 折叠/展开切换箭头 */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleToggleTab(item.tab.id)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation()
                        handleToggleTab(item.tab.id)
                      }
                    }}
                    className="flex h-4 w-4 shrink-0 items-center justify-center text-white/40 hover:text-white transition-transform cursor-pointer"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-150 ${
                        isTabCollapsed ? "-rotate-90 text-white/30" : "text-white/60"
                      }`}
                    />
                  </span>

                  {/* 运行状态指示灯 */}
                  <span
                    aria-label={
                      item.isStreaming ? t("agent.statusRunning") : t("agent.statusReady")
                    }
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.isStreaming ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                    }`}
                    role="status"
                  />

                  {/* Tab 标题 */}
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80">
                    {item.tabLabel}
                  </span>

                  {/* 下属设计原型数量角标 */}
                  <span className="rounded-[4px] bg-white/10 px-1.5 py-0.2 text-[10px] text-white/50 shrink-0 font-mono">
                    {item.designs.length}
                  </span>
                </div>

                {/* 子级：设计原型列表（按设计族与版本聚合） */}
                {!isTabCollapsed && (
                  <div className="space-y-0.5">
                    {item.designs.length === 0 ? (
                      <div
                        style={{ marginLeft: "10px" }}
                        className="flex h-7 items-center px-2 text-[11px] text-white/30 italic select-none"
                      >
                        <span>{t("frontDesign.noDesignsInSession")}</span>
                      </div>
                    ) : (
                      item.designGroups.map((group) => {
                        const { root, versions, isCurrentActive } = group
                        const latestVersion = versions[versions.length - 1] ?? root

                        // 当前族中激活的具体设计节点或最新版本
                        const activeItemInGroup =
                          versions.find((v) => v.id === activeDesignId) ?? null
                        const currentVersionItem = activeItemInGroup ?? latestVersion

                        return (
                          <div
                            key={root.id}
                            role="button"
                            tabIndex={0}
                            data-item-level="prompt"
                            aria-current={isCurrentActive ? "page" : undefined}
                            style={{ marginLeft: "10px" }}
                            onClick={() => {
                              handleDesignClick(currentVersionItem, item.tab.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                handleDesignClick(currentVersionItem, item.tab.id)
                              }
                            }}
                            className={`group flex h-7 items-center justify-between gap-1.5 rounded-[6px] px-1.5 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 cursor-pointer ${
                              isCurrentActive
                                ? "bg-white/10 text-white font-medium"
                                : "text-white/70"
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-1.5 flex-1">
                              {currentVersionItem.isStreaming ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-pink-400" />
                              ) : (
                                <Palette
                                  className={`h-3.5 w-3.5 shrink-0 ${
                                    isCurrentActive ? "text-pink-400" : "text-white/45"
                                  }`}
                                />
                              )}
                              <span className="min-w-0 flex-1 truncate text-xs select-none">
                                {root.title || t("frontDesign.title")}
                              </span>

                              {/* 当前显示的版本号 */}
                              <span className="shrink-0 rounded bg-pink-500/20 px-1 py-0.2 font-mono text-[9px] font-semibold leading-none text-pink-300">
                                v{currentVersionItem.version ?? 1}
                              </span>
                            </div>

                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                              <LxIconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // 删除该族的所有版本
                                  versions.forEach((v) => frontDesignStore.removeDesign(v.id))
                                }}
                                aria-label={t("frontDesign.deleteDesign")}
                                title={{
                                  content: t("frontDesign.deleteDesign"),
                                  placement: "top",
                                }}
                              >
                                <Trash2 className="h-3 w-3 text-white/40 hover:text-red-400" />
                              </LxIconButton>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
