import type { AgentSendContext } from "@shared/contracts/agent"
import { ChevronLeft, ChevronRight, History, Plus } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentPage, ChatHistoryPanel } from "@/features/agent"
import { agentApi } from "@/features/agent/api/agentApi"
import { sessionListStore, toSessionFilter } from "@/features/agent/hooks/sessionListStore"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"

/**
 * 右侧栏 (集成 Agent 页面与控制按钮)
 */
export const RightSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const { pathname } = useLocation()
  const [currentProject, setCurrentProject] = useState<{ id: string; path?: string }>()
  const restoreChatRef = useRef<((sessionId: string) => void) | null>(null)
  const newChatRef = useRef<(() => void) | null>(null)
  const chatSessions = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getSessions,
  )
  const currentSessionId = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getCurrentSessionId,
  )

  // 解析当前选中的项目 item（URL itemId → 项目）。
  useEffect(() => {
    const itemId = searchParams.get("itemId")
    if (!itemId) {
      setCurrentProject(undefined)
      return
    }

    let current = true
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

  // 会话归属上下文：项目 item 会话或页面会话（item 解析中返回 undefined，避免误建桶）。
  const context = useMemo<AgentSendContext | undefined>(() => {
    const itemId = searchParams.get("itemId")
    if (itemId) {
      return currentProject
        ? { projectItemId: itemId, projectId: currentProject.id, cwd: currentProject.path }
        : undefined
    }
    return { page: pathname }
  }, [searchParams, currentProject, pathname])

  // 归属变化：刷新历史列表并自动加载最近会话（默认加载上次对话）。
  useEffect(() => {
    if (!context) return
    const filter = toSessionFilter(context)
    if (!filter) return
    let cancelled = false
    sessionListStore.setCurrentSessionId(null)
    void sessionListStore.refresh(filter)
    void agentApi
      .listSessions(filter)
      .then((sessions) => {
        if (cancelled) return
        if (sessions[0]) {
          restoreChatRef.current?.(sessions[0].id)
        } else {
          newChatRef.current?.()
        }
      })
      .catch(() => {
        // IPC 失败：保持空展示。
      })
    return () => {
      cancelled = true
    }
  }, [context])

  if (isCollapsed) {
    return (
      <aside className="flex h-full w-10 max-w-10 min-w-10 shrink-0 flex-col items-center gap-2 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-1.5 transition-[width,min-width,max-width] duration-300 ease-in-out">
        <LxIconButton
          aria-label="展开右侧栏"
          title={{ content: "展开右侧栏", placement: "left" }}
          onClick={() => setIsCollapsed(false)}
        >
          <ChevronLeft className="h-4 w-4" />
        </LxIconButton>

        <LxIconButton
          aria-label="新建对话"
          title={{ content: "新建对话", placement: "left" }}
          onClick={() => {
            newChatRef.current?.()
            setIsCollapsed(false)
          }}
        >
          <Plus className="h-4 w-4" />
        </LxIconButton>

        <LxIconButton
          aria-label="历史对话"
          title={{ content: "历史对话", placement: "left" }}
          onClick={() => setIsCollapsed(false)}
        >
          <History className="h-4 w-4" />
        </LxIconButton>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[380px] max-w-[380px] min-w-[380px] shrink-0 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] p-2 transition-[width,min-width,max-width] duration-300 ease-in-out">
      <div className="mb-2 flex h-7 w-full items-center justify-between border-b border-white/5 pb-2">
        <div className="flex items-center gap-1">
          <LxIconButton
            aria-label="新建对话"
            title={{ content: "新建对话", placement: "bottom" }}
            onClick={() => newChatRef.current?.()}
          >
            <Plus className="h-4 w-4" />
          </LxIconButton>

          <LxTooltip
            content={
              <ChatHistoryPanel
                currentSessionId={currentSessionId}
                sessions={chatSessions}
                onRestore={(sessionId) => {
                  restoreChatRef.current?.(sessionId)
                  setIsHistoryOpen(false)
                }}
              />
            }
            contentClassName="!p-2"
            open={isHistoryOpen}
            onOpenChange={(open) => {
              setIsHistoryOpen(open)
              if (open) {
                const filter = toSessionFilter(context)
                if (filter) void sessionListStore.refresh(filter)
              }
            }}
            placement="bottom"
            trigger="click"
          >
            <LxIconButton
              aria-label="历史对话"
              title={{ content: "历史对话", placement: "bottom" }}
            >
              <History className="h-4 w-4" />
            </LxIconButton>
          </LxTooltip>
        </div>

        <LxIconButton
          aria-label="折叠右侧栏"
          title={{ content: "折叠右侧栏", placement: "left" }}
          onClick={() => setIsCollapsed(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </LxIconButton>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <AgentPage
          onNewChatRef={(fn) => {
            newChatRef.current = fn
          }}
          onRestoreChatRef={(fn) => {
            restoreChatRef.current = fn
          }}
          context={context}
          currentProjectId={currentProject?.id}
          currentProjectPath={currentProject?.path}
        />
      </div>
    </aside>
  )
}
