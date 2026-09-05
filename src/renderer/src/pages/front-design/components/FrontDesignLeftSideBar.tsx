import { Loader2, Palette, Search, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { useTranslation } from "@/i18n"

export interface FrontDesignLeftSideBarProps {
  isCollapsed?: boolean
}

const ALL_SESSIONS_VALUE = "__all_sessions__"

/**
 * 渲染前端设计页面专属左侧栏内容：展示设计历史列表并支持自由切换。
 */
export const FrontDesignLeftSideBar = ({
  isCollapsed = false,
}: FrontDesignLeftSideBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { designs, activeDesignId } = useFrontDesign()

  const tabs = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getTabs)
  const activeTabId = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getActiveTabId)
  const sessions = useSyncExternalStore(sessionListStore.subscribe, sessionListStore.getSessions)

  // 搜索关键字
  const [searchKeyword, setSearchKeyword] = useState<string>("")

  // 获取当前激活 Tab 绑定的会话 ID
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [tabs, activeTabId])
  const activeSessionId = activeTab?.sessionId ?? null

  // 选中的过滤会话 ID，默认跟随当前激活的 session，若无 session 则显示全部
  const [selectedSessionFilter, setSelectedSessionFilter] = useState<string>(() => {
    return activeSessionId || ALL_SESSIONS_VALUE
  })

  // 生成会话下拉选项
  const sessionOptions = useMemo<LxSelectOption<string>[]>(() => {
    const options: LxSelectOption<string>[] = [
      { value: ALL_SESSIONS_VALUE, label: t("frontDesign.allSessions") },
    ]

    // 收集所有已打开的 Tab 以及有前端设计历史的 Session
    const sessionMap = new Map<string, string>()

    // 1. 来自打开的 Tab
    tabs.forEach((tab, index) => {
      if (tab.sessionId) {
        const session = sessions.find((s) => s.id === tab.sessionId)
        const name =
          tab.title?.trim() ||
          session?.title?.trim() ||
          t("agent.tabNumber", { number: index + 1 })
        sessionMap.set(tab.sessionId, name)
      }
    })

    // 2. 来自设计历史中记录的 sessionId
    designs.forEach((d) => {
      if (d.sessionId && !sessionMap.has(d.sessionId)) {
        const session = sessions.find((s) => s.id === d.sessionId)
        const name = session?.title?.trim() || t("frontDesign.standaloneSession")
        sessionMap.set(d.sessionId, name)
      }
    })

    sessionMap.forEach((label, sessionId) => {
      options.push({
        value: sessionId,
        label,
      })
    })

    return options
  }, [tabs, sessions, designs, t])

  // 过滤后的前端设计列表（会话过滤 + 搜索过滤）
  const filteredDesigns = useMemo(() => {
    let result = designs

    // 1. Session 过滤
    if (selectedSessionFilter !== ALL_SESSIONS_VALUE) {
      result = result.filter((d) => d.sessionId === selectedSessionFilter)
    }

    // 2. 搜索关键词过滤
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) {
      result = result.filter((d) => {
        const title = (d.title || t("frontDesign.title")).toLowerCase()
        return title.includes(keyword)
      })
    }

    return result
  }, [designs, selectedSessionFilter, searchKeyword, t])

  // 当切换 Session 筛选且当前 activeDesignId 不在当前会话的列表中时，自动切换激活项为该会话的第一项
  useEffect(() => {
    if (filteredDesigns.length > 0) {
      const isCurrentActiveInFiltered = filteredDesigns.some((d) => d.id === activeDesignId)
      if (!isCurrentActiveInFiltered) {
        frontDesignStore.setActiveDesignId(filteredDesigns[0].id)
      }
    }
  }, [selectedSessionFilter, filteredDesigns, activeDesignId])

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2">
          {designs.map((d) => {
            const isActive = d.id === activeDesignId
            return (
              <LxIconButton
                key={d.id}
                highlighted={isActive}
                onClick={() => frontDesignStore.setActiveDesignId(d.id)}
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
          <span className="rounded-[4px] bg-white/10 px-1.5 py-0.2 text-[10px] text-white/50 shrink-0">
            {filteredDesigns.length}
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

      {/* Session 选择器 */}
      <div className="px-1">
        <LxSelect
          value={selectedSessionFilter}
          onChange={setSelectedSessionFilter}
          options={sessionOptions}
          size="small"
          className="w-full"
          aria-label={t("frontDesign.sessionFilter")}
        />
      </div>

      {/* 列表内容 */}
      <div className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-1 pb-2">
        {filteredDesigns.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-white/35">
            {designs.length === 0
              ? t("frontDesign.noDesigns")
              : searchKeyword.trim()
                ? t("frontDesign.noMatchingDesigns")
                : t("frontDesign.noDesignsInSession")}
          </div>
        ) : (
          filteredDesigns.map((d) => {
            const isActive = d.id === activeDesignId

            return (
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                data-active={isActive ? "true" : undefined}
                onClick={() => frontDesignStore.setActiveDesignId(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    frontDesignStore.setActiveDesignId(d.id)
                  }
                }}
                className={`front-design-sidebar-item group flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-xs transition-colors cursor-pointer border ${
                  isActive
                    ? "bg-pink-500/15 border-pink-500/30 border-l-4 !border-l-pink-500 text-white font-medium shadow-sm"
                    : "border-transparent text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className={`front-design-sidebar-icon flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] ${
                      isActive
                        ? "bg-pink-500/20 text-pink-400"
                        : "bg-white/5 text-white/40 group-hover:text-white/70"
                    }`}
                  >
                    {d.isStreaming ? (
                      <Loader2 className="h-3 w-3 animate-spin text-pink-400" />
                    ) : (
                      <Palette className="h-3 w-3" />
                    )}
                  </div>
                  <span className="truncate text-xs font-medium">
                    {d.title || t("frontDesign.title")}
                  </span>
                </div>

                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                  <LxIconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      frontDesignStore.removeDesign(d.id)
                    }}
                    aria-label={t("frontDesign.deleteDesign")}
                    title={{ content: t("frontDesign.deleteDesign"), placement: "top" }}
                  >
                    <Trash2 className="h-3 w-3 text-white/40 hover:text-red-400" />
                  </LxIconButton>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
