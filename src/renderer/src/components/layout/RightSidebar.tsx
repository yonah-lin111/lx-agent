import type { AgentSendContext } from "@shared/contracts/agent"
import { ChevronLeft, ChevronRight, History, MoreVertical, Plus, Tag, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenuItem } from "@/components/ui/LxMenu"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentPage, ChatHistoryPanel } from "@/features/agent"
import { agentApi } from "@/features/agent/api/agentApi"
import { sessionListStore, toSessionFilter } from "@/features/agent/hooks/sessionListStore"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"

// 展开态最小/最大宽度比例（相对视口）。
const MIN_WIDTH_RATIO = 0.32
const MAX_WIDTH_RATIO = 0.38

// 约束宽度到 [25vw, 40vw]。
const clampWidth = (value: number): number => {
  const minWidth = window.innerWidth * MIN_WIDTH_RATIO
  const maxWidth = window.innerWidth * MAX_WIDTH_RATIO
  return Math.min(Math.max(value, minWidth), maxWidth)
}

/**
 * 右侧栏 (集成 Agent 页面与控制按钮)
 */
export const RightSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [width, setWidth] = useState<number>(() => window.innerWidth * MIN_WIDTH_RATIO)
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)
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
  const [titleDraft, setTitleDraft] = useState("")
  const [isTitleMenuOpen, setIsTitleMenuOpen] = useState(false)
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

  // 提交标题修改：写入 DB 并本地同步，随后关闭标题 tooltip。
  const commitTitle = (): void => {
    setIsTitleMenuOpen(false)
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

  // 拖拽左侧边缘调整宽度：最小 25vw，最大 40vw。
  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = { startX: event.clientX, startWidth: width }
    setIsResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = resizeStartRef.current
    if (!start) return
    const next = start.startWidth - (event.clientX - start.startX)
    setWidth(clampWidth(next))
  }

  const handleResizeEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = null
    setIsResizing(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
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

  // 窗口尺寸变化（含全屏切换）后重新约束宽度，避免展开态宽度超出当前 40vw 上限。
  useEffect(() => {
    if (isCollapsed) return
    const handleWindowResize = (): void => {
      setWidth((current) => clampWidth(current))
    }
    window.addEventListener("resize", handleWindowResize)
    return () => window.removeEventListener("resize", handleWindowResize)
  }, [isCollapsed])

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

  // 新对话（未入库）不显示标题；仅会话落库（currentSessionId 存在）后展示。
  const titleControls = currentSessionId && (
    <div className="flex min-w-0 shrink-0 items-center">
      <LxTooltip
        title="会话标题"
        content={
          <LxInput
            multiline
            aria-label="会话标题"
            className="px-1"
            maxLength={40}
            rows={2}
            size="xs"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
          />
        }
        contentClassName="!w-64"
        onConfirm={commitTitle}
        onOpenChange={(open) => {
          setIsTitleMenuOpen(open)
          if (open) setTitleDraft(currentTitle)
        }}
        open={isTitleMenuOpen}
        placement="bottom"
      >
        <LxIconButton aria-label={`会话标题 ${currentTitle}`} size="small">
          <Tag className="h-3.5 w-3.5" />
        </LxIconButton>
      </LxTooltip>
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
      className={`relative flex h-full shrink-0 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121] ${
        isResizing
          ? "transition-none"
          : "transition-[width,min-width,max-width] duration-300 ease-in-out"
      } ${isCollapsed ? "w-10 max-w-10 min-w-10 items-center p-1.5" : "p-2"}`}
      style={isCollapsed ? undefined : { width, minWidth: width, maxWidth: width }}
    >
      {!isCollapsed && (
        <div
          aria-label="调整右侧栏宽度"
          className={`absolute top-0 left-0 z-10 h-full w-1 cursor-col-resize touch-none bg-transparent hover:bg-white/20 active:bg-white/30 ${
            isResizing ? "bg-white/30" : ""
          }`}
          onPointerCancel={handleResizeEnd}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
        />
      )}
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
