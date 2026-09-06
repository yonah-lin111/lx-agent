import { Loader2, Palette, Search, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore, useFrontDesign } from "@/features/agent/hooks/frontDesignStore"
import { useTranslation } from "@/i18n"

export interface FrontDesignLeftSideBarProps {
  isCollapsed?: boolean
}

const formatDateTime = (timestamp?: number): string => {
  if (!timestamp) return ""
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

/**
 * 渲染前端设计页面专属左侧栏内容：默认展示当前活跃会话的设计历史列表并支持自由切换。
 */
export const FrontDesignLeftSideBar = ({
  isCollapsed = false,
}: FrontDesignLeftSideBarProps): React.JSX.Element => {
  const { t } = useTranslation()
  const { designs, activeDesignId } = useFrontDesign()

  const tabs = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getTabs)
  const activeTabId = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getActiveTabId)

  // 搜索关键字
  const [searchKeyword, setSearchKeyword] = useState<string>("")

  // 获取当前激活 Tab 绑定的会话 ID
  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [tabs, activeTabId])
  const activeSessionId = activeTab?.sessionId ?? null

  // 获取当前活跃设计项的所属会话（优先展示当前活跃 Tab 会话；若当前激活设计属于特定会话且当前 Tab 无会话绑定，对齐该会话）
  const activeDesign = useMemo(
    () => designs.find((d) => d.id === activeDesignId) ?? null,
    [designs, activeDesignId],
  )
  const effectiveSessionId = activeSessionId ?? activeDesign?.sessionId ?? null

  // 过滤与排序后的前端设计列表（优先匹配有效会话 + 搜索过滤 + 从旧到新升序排序）
  const filteredDesigns = useMemo(() => {
    let result = designs.filter((d) =>
      effectiveSessionId ? d.sessionId === effectiveSessionId : !d.sessionId,
    )

    // 搜索关键词过滤
    const keyword = searchKeyword.trim().toLowerCase()
    if (keyword) {
      result = result.filter((d) => {
        const title = (d.title || t("frontDesign.title")).toLowerCase()
        return title.includes(keyword)
      })
    }

    // 按更新/创建时间从旧到新升序排序
    result.sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0))

    return result
  }, [designs, effectiveSessionId, searchKeyword, t])

  // 当活跃会话变化或列表更新时，若当前激活项不属于当前会话的过滤列表：
  // 1. 若当前会话有设计，自动激活该会话第一项；
  // 2. 若当前会话无设计，将 activeDesignId 置空，使右侧画布同步清空。
  useEffect(() => {
    const isCurrentActiveInFiltered = filteredDesigns.some((d) => d.id === activeDesignId)
    if (!isCurrentActiveInFiltered) {
      const nextId = filteredDesigns[0]?.id ?? null
      if (nextId !== activeDesignId) {
        frontDesignStore.setActiveDesignId(nextId)
      }
    }
  }, [filteredDesigns, activeDesignId])

  if (isCollapsed) {
    return (
      <div className="flex h-full min-w-0 flex-col gap-3 items-center">
        <div className="flex h-7 shrink-0 items-center justify-end px-1" />
        <nav className="custom-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto px-0.5 pb-2">
          {filteredDesigns.map((d) => {
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
        {filteredDesigns.length > 0 && (
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
                data-item-level="prompt"
                aria-current={isActive ? "page" : undefined}
                onClick={() => frontDesignStore.setActiveDesignId(d.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    frontDesignStore.setActiveDesignId(d.id)
                  }
                }}
                className={`group flex items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 cursor-pointer ${
                  isActive ? "bg-white/5 text-white" : "text-white/70"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2 flex-1">
                  {d.isStreaming ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-white/80" />
                  ) : (
                    <Palette
                      className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-white/80" : "text-white/45"}`}
                    />
                  )}
                  <div className="flex min-w-0 flex-col flex-1">
                    <span className="truncate text-xs font-medium select-none leading-tight">
                      {d.title || t("frontDesign.title")}
                    </span>
                    {d.updatedAt ? (
                      <span className="text-[10px] text-white/40 select-none leading-tight mt-0.5 truncate font-mono">
                        {formatDateTime(d.updatedAt)}
                      </span>
                    ) : null}
                  </div>
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
