import type { AgentSendContext } from "@shared/contracts/agent"
import {
  ChevronLeft,
  ChevronRight,
  History,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMenuItem } from "@/components/ui/LxMenu"
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
  const currentSession = currentSessionId
    ? chatSessions.find((session) => session.id === currentSessionId)
    : undefined
  const currentTitle = currentSession?.title ?? "new chat"
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState("")
  const titleBeforeEditRef = useRef(currentTitle)
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  // 进入标题编辑态（点击标题或设置菜单"重命名"触发）。
  const startTitleEdit = (): void => {
    if (!currentSessionId) return
    titleBeforeEditRef.current = currentTitle
    setTitleDraft(currentTitle)
    setIsEditingTitle(true)
  }

  // 提交标题修改：写入 DB 并本地同步。
  const commitTitle = (): void => {
    setIsEditingTitle(false)
    if (!currentSessionId) return
    const trimmed = titleDraft.trim()
    if (!trimmed || trimmed === currentTitle) return
    const id = currentSessionId
    void agentApi
      .renameSession(id, trimmed)
      .then(() => sessionListStore.updateSessionTitle(id, trimmed))
      .catch(() => {
        // 重命名失败：保持原标题。
      })
  }

  // 设置菜单"删除"二次确认：首次点击进入确认态，再次点击才真正删除。
  const handleDeleteSessionClick = (): void => {
    if (!currentSessionId) return
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }
    setIsConfirmingDelete(false)
    setIsSessionMenuOpen(false)
    const id = currentSessionId
    void agentApi
      .deleteSession(id)
      .then(() => {
        sessionListStore.removeSession(id)
        newChatRef.current?.()
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

  // 切换会话（含新建/删除导致的 null）时退出标题编辑态，避免残留编辑态复现。
  useEffect(() => {
    setIsEditingTitle(false)
  }, [currentSessionId])

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

  // 新对话（未入库）不显示标题；仅会话落库（currentSessionId 存在）后展示。
  const titleControls = currentSessionId && (
    <div className="flex min-w-0 shrink-0 items-center">
      {isEditingTitle ? (
        <input
          autoFocus
          aria-label="会话标题"
          className="w-[12ch] border-b border-white/20 bg-transparent px-1 text-left text-xs text-white/80 outline-none"
          maxLength={40}
          title={titleDraft}
          value={titleDraft}
          onBlur={commitTitle}
          onChange={(event) => setTitleDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Escape") {
              setTitleDraft(titleBeforeEditRef.current)
              setIsEditingTitle(false)
              return
            }
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              commitTitle()
            }
          }}
        />
      ) : (
        <button
          type="button"
          aria-label={`编辑会话标题 ${currentTitle}`}
          className="min-w-[4ch] max-w-[12ch] truncate px-1 text-center text-xs text-white/65 hover:text-white/90"
          title={currentTitle}
          onClick={startTitleEdit}
        >
          {currentTitle}
        </button>
      )}
    </div>
  )

  const sessionMenu = (
    <LxTooltip
      content={
        <div className="flex min-w-36 flex-col gap-0.5">
          <LxMenuItem
            className="disabled:opacity-35"
            disabled={!currentSessionId}
            leading={<Plus className="h-3.5 w-3.5 text-white/45" />}
            onClick={() => {
              setIsSessionMenuOpen(false)
              setIsConfirmingDelete(false)
              newChatRef.current?.()
            }}
          >
            新对话
          </LxMenuItem>
          <LxMenuItem
            className="disabled:opacity-35"
            disabled={!currentSessionId}
            leading={<Pencil className="h-3.5 w-3.5 text-white/45" />}
            onClick={() => {
              setIsSessionMenuOpen(false)
              setIsConfirmingDelete(false)
              startTitleEdit()
            }}
          >
            重命名
          </LxMenuItem>
          <LxMenuItem
            active={isConfirmingDelete}
            className="disabled:opacity-35"
            danger
            disabled={!currentSessionId}
            leading={
              <Trash2
                className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
              />
            }
            onClick={handleDeleteSessionClick}
          >
            {isConfirmingDelete ? "确认删除" : "删除会话"}
          </LxMenuItem>
        </div>
      }
      contentClassName="!p-1"
      onOpenChange={(open) => {
        setIsSessionMenuOpen(open)
        if (!open) setIsConfirmingDelete(false)
      }}
      open={isSessionMenuOpen}
      placement="bottom"
      trigger="click"
    >
      <LxIconButton aria-label="会话设置" size="medium">
        <MoreVertical className="h-3.5 w-3.5" />
      </LxIconButton>
    </LxTooltip>
  )

  // Agent 页面折叠时隐藏而非卸载，避免折叠再展开后消息列表被清空。
  const agentPage = (
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
  )

  return (
    <aside
      className={`flex h-full shrink-0 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] transition-[width,min-width,max-width] duration-300 ease-in-out ${
        isCollapsed
          ? "w-10 max-w-10 min-w-10 items-center p-1.5"
          : "w-[380px] max-w-[380px] min-w-[380px] p-2"
      }`}
    >
      {isCollapsed ? (
        <div className="flex flex-col items-center gap-2">
          <LxIconButton
            aria-label="展开右侧栏"
            title={{ content: "展开右侧栏", placement: "left" }}
            onClick={() => setIsCollapsed(false)}
          >
            <ChevronLeft className="h-4 w-4" />
          </LxIconButton>

          <LxIconButton
            aria-label="新建对话"
            disabled={!currentSessionId}
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
        </div>
      ) : (
        <div className="mb-2 flex h-7 w-full items-center justify-between border-b border-white/5 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            {titleControls}

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

            {sessionMenu}
          </div>

          <LxIconButton
            aria-label="折叠右侧栏"
            title={{ content: "折叠右侧栏", placement: "left" }}
            onClick={() => setIsCollapsed(true)}
          >
            <ChevronRight className="h-4 w-4" />
          </LxIconButton>
        </div>
      )}

      <div className={isCollapsed ? "hidden" : "flex-1 min-h-0 overflow-hidden"}>{agentPage}</div>
    </aside>
  )
}
