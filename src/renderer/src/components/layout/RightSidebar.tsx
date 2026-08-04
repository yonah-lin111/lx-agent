import { ChevronLeft, ChevronRight, History, Plus } from "lucide-react"
import type React from "react"
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentPage, ChatHistoryPanel } from "@/features/agent"
import { chatHistoryStore } from "@/features/agent/hooks/chatHistoryStore"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"

/**
 * 右侧栏 (集成 Agent 页面与控制按钮)
 */
export const RightSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)
  const [chatKey, setChatKey] = useState<number>(0)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [searchParams] = useSearchParams()
  const [currentProject, setCurrentProject] = useState<{ id: string; path?: string }>()
  const restoreChatRef = useRef<((sessionId: string) => void) | null>(null)
  const chatSessions = useSyncExternalStore(
    chatHistoryStore.subscribe,
    chatHistoryStore.getSessions,
  )
  const currentSessionId = useSyncExternalStore(
    chatHistoryStore.subscribe,
    chatHistoryStore.getCurrentSessionId,
  )

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
            setChatKey((k) => k + 1)
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
            onClick={() => setChatKey((k) => k + 1)}
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
            onOpenChange={setIsHistoryOpen}
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
          key={chatKey}
          onRestoreChatRef={(fn) => {
            restoreChatRef.current = fn
          }}
          currentProjectId={currentProject?.id}
          currentProjectPath={currentProject?.path}
        />
      </div>
    </aside>
  )
}
