import type { AgentSendContext } from "@shared/contracts/agent"
import { ChevronLeft, ChevronRight, History, MessageSquare, Plus, Workflow } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentPage, AgentTabBar, agentViewStore, ChatHistoryPanel } from "@/features/agent"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import { useTranslation } from "@/i18n"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

// 展开态最小/最大宽度（相对视口宽度，单位 vw）。
const MIN_WIDTH_VW = 30
const MAX_WIDTH_VW = 40

// 约束宽度到 [30vw, 40vw]。
const clampWidth = (value: number): number => Math.min(Math.max(value, MIN_WIDTH_VW), MAX_WIDTH_VW)

/**
 * 右侧栏 (集成多 Tab Agent 管理与控制按钮)
 */
export const RightSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const { t } = useTranslation()
  const { warning } = useLxToast()

  const tabs = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getTabs)
  const activeTabId = useSyncExternalStore(agentTabStore.subscribe, agentTabStore.getActiveTabId)
  const activeTab = useMemo(() => tabs.find((t) => t.id === activeTabId), [tabs, activeTabId])

  const tabActionsRef = useRef<
    Record<
      string,
      {
        newChat?: () => void
        restoreChat?: (sessionId: string) => void
        toggleExecutionFlow?: () => void
      }
    >
  >({})

  const viewMode = useSyncExternalStore(agentViewStore.subscribe, agentViewStore.getViewMode)

  const handleToggleViewMode = useCallback((): void => {
    const ok = agentViewStore.toggleViewMode()
    if (!ok) {
      warning(t("agent.viewSwitchBlocked"))
    }
  }, [warning, t])

  // Agent 运行中禁止切换/新建会话（会中止正在进行的 run），toast 提示。
  const blockIfGenerating = useCallback((): boolean => {
    if (!agentViewStore.isGenerating()) return false
    warning(t("agent.sessionSwitchBlocked"))
    return true
  }, [warning, t])

  // 同步折叠状态到全局存储，供其他区域（如 Markdown 编辑器）感知布局变化。
  useEffect(() => {
    rightSidebarStore.setCollapsed(isCollapsed)
  }, [isCollapsed])

  const [width, setWidth] = useState<number>(MIN_WIDTH_VW)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const [currentProject, setCurrentProject] = useState<{ id: string; path?: string }>()
  // 项目列表（历史面板项目 tag 筛选用）。
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([])

  const chatSessions = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getSessions,
  )

  // 删除会话：确认后删除并本地移除；若某个 Tab 打开了该会话，则重置该 Tab 为新对话。
  const handleDeleteSession = (sessionId: string): void => {
    const tabWithSession = agentTabStore.findTabBySessionId(sessionId)
    if (tabWithSession?.id === activeTabId && blockIfGenerating()) return
    void agentApi
      .deleteSession(sessionId)
      .then(() => {
        sessionListStore.removeSession(sessionId)
        if (tabWithSession) {
          tabActionsRef.current[tabWithSession.id]?.newChat?.()
        }
      })
      .catch(() => {
        // 删除失败：保持现状。
      })
  }

  // 解析当前选中的项目 item（URL itemId → 项目）。
  useEffect(() => {
    const itemId = searchParams.get("itemId")
    if (!itemId) {
      setCurrentProject(undefined)
      return
    }

    let current = true
    if (itemId.startsWith("temp-")) {
      const targetProjectId = itemId.slice("temp-".length)
      void projectNavigationApi.listProjects().then((projects) => {
        if (!current) return
        const project = projects.find((entry) => entry.id === targetProjectId)
        setCurrentProject(project ? { id: project.id, path: project.path } : undefined)
      })
      return () => {
        current = false
      }
    }

    void Promise.all([projectNavigationApi.listItems(), projectNavigationApi.listProjects()]).then(
      ([items, projects]) => {
        if (!current) return
        const item = items.find((entry) => entry.id === itemId)
        const project = projects.find((entry) => entry.id === item?.projectId)
        setCurrentProject(project ? { id: project.id, path: project.path } : undefined)
      },
    )
    return () => {
      current = false
    }
  }, [searchParams])

  // 拖拽左侧边缘调整宽度：最小 30vw，最大 40vw。
  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = { startX: event.clientX, startWidth: width }
    setIsResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.buttons !== 1) {
      handleResizeEnd(event)
      return
    }
    const start = resizeStartRef.current
    if (!start) return
    // 拖拽像素增量按当前视口宽度换算为 vw。
    const next = start.startWidth - (event.clientX - start.startX) / (window.innerWidth / 100)
    setWidth(clampWidth(next))
  }

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = null
    setIsResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  // 拖拽期间禁用文本选中，避免误选侧栏内容。
  useEffect(() => {
    if (!isResizing) return
    const previous = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.userSelect = previous
    }
  }, [isResizing])

  // 会话归属上下文：项目会话或页面会话。
  const context = useMemo<AgentSendContext | undefined>(() => {
    if (currentProject) {
      return { projectId: currentProject.id, cwd: currentProject.path }
    }
    return { page: pathname }
  }, [currentProject, pathname])

  // 挂载时刷新会话列表。
  useEffect(() => {
    void sessionListStore.refresh()
  }, [])

  // 拉取项目列表（历史面板项目 tag 筛选用）。
  useEffect(() => {
    let current = true
    void projectNavigationApi.listProjects().then((list) => {
      if (!current) return
      setProjects(list.map((project) => ({ id: project.id, name: project.name })))
    })
    return () => {
      current = false
    }
  }, [])

  // 新对话按钮：仅在当前激活 Tab 已经有会话绑定时高亮可用。
  const newChatButton = (
    <LxIconButton
      aria-label={t("rightSidebar.newChat")}
      disabled={!activeTab?.sessionId}
      title={{ content: t("rightSidebar.newChat"), placement: "bottom" }}
      onClick={() => {
        if (blockIfGenerating()) return
        if (activeTab) {
          tabActionsRef.current[activeTab.id]?.newChat?.()
        }
      }}
      size="small"
      className="shrink-0"
    >
      <Plus className="h-3.5 w-3.5" />
    </LxIconButton>
  )

  return (
    <aside
      className={`right-sidebar relative flex h-full shrink-0 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] ${
        isResizing
          ? "transition-none"
          : "transition-[width,min-width,max-width] duration-300 ease-in-out"
      } ${isCollapsed ? "w-10 max-w-10 min-w-10 items-center pt-2 px-1.5 pb-1.5" : "p-0"}`}
      style={
        isCollapsed
          ? undefined
          : { width: `${width}vw`, minWidth: `${width}vw`, maxWidth: `${width}vw` }
      }
    >
      {!isCollapsed && (
        <div
          aria-label={t("rightSidebar.resizeSidebar")}
          className="absolute top-0 left-0 z-20 h-full w-1.5 cursor-col-resize touch-none hover:bg-white/10 transition-colors"
          onPointerCancel={handleResizeEnd}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}
      {isCollapsed ? (
        <div className="flex flex-col items-center gap-2">
          <LxIconButton
            aria-label={t("rightSidebar.expandSidebar")}
            title={{ content: t("rightSidebar.expandSidebar"), placement: "left" }}
            onClick={() => setIsCollapsed(false)}
            size="small"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </LxIconButton>
        </div>
      ) : (
        <div className="flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden p-2 pb-0">
          {/* 顶部控制栏 */}
          <div className="mb-2 flex h-7 shrink-0 items-center justify-between border-b border-white/5 gap-1 min-w-0">
            <div className="flex shrink-0 items-center gap-1">
              {newChatButton}

              <LxTooltip
                hover={{
                  content: t("rightSidebar.chatHistory"),
                  placement: "bottom",
                }}
                click={{
                  content: (
                    <ChatHistoryPanel
                      currentSessionId={activeTab?.sessionId ?? null}
                      sessions={chatSessions}
                      currentProjectId={currentProject?.id}
                      projects={projects}
                      onRestore={(sessionId) => {
                        if (blockIfGenerating()) return
                        const existingTab = agentTabStore.findTabBySessionId(sessionId)
                        if (existingTab) {
                          agentTabStore.switchTab(existingTab.id)
                          warning(t("agent.switchedToExistingTab"))
                        } else {
                          const current = agentTabStore.getActiveTab()
                          if (current) {
                            tabActionsRef.current[current.id]?.restoreChat?.(sessionId)
                          }
                        }
                        setIsHistoryOpen(false)
                      }}
                      onDelete={handleDeleteSession}
                    />
                  ),
                  contentClassName: "!p-2",
                  placement: "bottom",
                  open: isHistoryOpen,
                  onOpenChange: (open) => {
                    setIsHistoryOpen(open)
                    if (open) {
                      void sessionListStore.refresh()
                    }
                  },
                }}
              >
                <LxIconButton
                  aria-label={t("rightSidebar.chatHistory")}
                  size="small"
                  className="shrink-0"
                >
                  <History className="h-3.5 w-3.5" />
                </LxIconButton>
              </LxTooltip>

              <LxIconButton
                aria-label={viewMode === "flow" ? t("agent.qaView") : t("agent.executionFlowView")}
                title={{
                  content: viewMode === "flow" ? t("agent.qaView") : t("agent.executionFlowView"),
                  placement: "bottom",
                }}
                onClick={handleToggleViewMode}
                size="small"
                className="shrink-0"
              >
                {viewMode === "flow" ? (
                  <MessageSquare className="h-3.5 w-3.5" />
                ) : (
                  <Workflow className="h-3.5 w-3.5" />
                )}
              </LxIconButton>
            </div>

            {/* 中间横向 Tab 栏 */}
            <AgentTabBar />

            <div className="flex shrink-0 items-center justify-end gap-1">
              <LxIconButton
                aria-label={t("rightSidebar.collapseSidebar")}
                title={{ content: t("rightSidebar.collapseSidebar"), placement: "top" }}
                onClick={() => setIsCollapsed(true)}
                size="small"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </LxIconButton>
            </div>
          </div>

          {/* 多 AgentPage 实例保活渲染 */}
          <div className="relative flex-1 min-h-0 min-w-0 overflow-hidden">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`h-full w-full ${tab.id === activeTabId ? "flex flex-col" : "hidden"}`}
              >
                <AgentPage
                  tabId={tab.id}
                  initialSessionId={tab.sessionId}
                  onSessionBound={(sessionId) => {
                    agentTabStore.setTabSessionId(tab.id, sessionId)
                  }}
                  onNewChatRef={(fn) => {
                    tabActionsRef.current[tab.id] = {
                      ...tabActionsRef.current[tab.id],
                      newChat: fn,
                    }
                  }}
                  onRestoreChatRef={(fn) => {
                    tabActionsRef.current[tab.id] = {
                      ...tabActionsRef.current[tab.id],
                      restoreChat: fn,
                    }
                  }}
                  onToggleExecutionFlowRef={(fn) => {
                    tabActionsRef.current[tab.id] = {
                      ...tabActionsRef.current[tab.id],
                      toggleExecutionFlow: fn,
                    }
                  }}
                  context={context}
                  currentProjectId={currentProject?.id}
                  currentProjectPath={currentProject?.path}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
