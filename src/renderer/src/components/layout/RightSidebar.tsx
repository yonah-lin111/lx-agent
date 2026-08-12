import type { AgentSendContext } from "@shared/contracts/agent"
import { ChevronLeft, ChevronRight, History, Plus, Trash2 } from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLocation, useSearchParams } from "react-router-dom"
import { McpStatusButton } from "@/components/layout/McpStatusButton"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { AgentPage, ChatHistoryPanel } from "@/features/agent"
import { agentApi } from "@/features/agent/api/agentApi"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { projectNavigationApi } from "@/features/project-navigation/api/projectNavigationApi"
import { rightSidebarStore } from "@/lib/rightSidebarStore"

// 展开态最小/最大宽度（相对视口宽度，单位 vw）。
const MIN_WIDTH_VW = 30
const MAX_WIDTH_VW = 40

// 约束宽度到 [30vw, 40vw]。
const clampWidth = (value: number): number =>
  Math.min(Math.max(value, MIN_WIDTH_VW), MAX_WIDTH_VW)

/**
 * 右侧栏 (集成 Agent 页面与控制按钮)
 */
export const RightSideBar = (): React.JSX.Element => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(true)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

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
  const pendingSessionIds = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getPendingSessionIds,
  )
  const currentSession = currentSessionId
    ? chatSessions.find((session) => session.id === currentSessionId)
    : undefined
  // 新会话（未入列表）时回退到 store 即时回填的生成标题，避免等到列表刷新后才显示。
  const currentTitle =
    currentSession?.title ?? sessionListStore.getCurrentSessionTitle() ?? "new chat"
  const [titleDraft, setTitleDraft] = useState("")
  const [isEditingTitle, setIsEditingTitle] = useState(false)

  // 提交标题修改：写入 DB 并本地同步，随后退出编辑态。
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

  // 删除会话：确认 tooltip 确认后删除并新建对话。
  const handleDeleteSession = (): void => {
    if (!currentSessionId) return
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

  // 拖拽左侧边缘调整宽度：最小 30vw，最大 40vw。
  const handleResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    resizeStartRef.current = { startX: event.clientX, startWidth: width }
    setIsResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleResizeMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = resizeStartRef.current
    if (!start) return
    // 拖拽像素增量按当前视口宽度换算为 vw。
    const next = start.startWidth - (event.clientX - start.startX) / (window.innerWidth / 100)
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

      // 窗口尺寸变化（含全屏切换）后宽度随 vw 自动重算，无需额外处理。
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

  // 挂载时恢复全局最近活跃会话（无会话则空白新对话）；导航切换不改变会话。
  useEffect(() => {
    let cancelled = false
    void sessionListStore.refresh()
    void agentApi
      .listSessions()
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

  // 新对话（未入库）不显示标题；仅会话落库（currentSessionId 存在）后展示。
  const newChatButton = (
    <LxIconButton
      aria-label="新建对话"
      disabled={!currentSessionId}
      title={{ content: "新建对话", placement: "bottom" }}
      onClick={() => newChatRef.current?.()}
    >
      <Plus className="h-4 w-4" />
    </LxIconButton>
  )

  // 会话标题：非编辑态为文本按钮（点击进入编辑），编辑态为行内下划线输入框。
  // 标题生成中（pending）展示 pulse 占位，暂不可编辑，避免覆盖自动生成的标题。
  const titleControls = currentSessionId && (
    <div className="flex min-w-0 shrink-0 items-center">
      {currentSessionId && pendingSessionIds.has(currentSessionId) ? (
        <span className="inline-block h-3 w-24 animate-pulse rounded-[3px] bg-white/[0.08]" />
      ) : isEditingTitle ? (
        <input
          autoFocus
          aria-label="会话标题"
          className="w-[16ch] border-b border-white/20 bg-transparent px-1 text-center text-xs text-white/80 outline-none"
          maxLength={40}
          value={titleDraft}
          onBlur={commitTitle}
          onChange={(event) => setTitleDraft(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Escape") {
              setTitleDraft(currentTitle)
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
          className="min-w-[4ch] max-w-[14ch] truncate px-1 text-right text-xs text-white/65 hover:text-white/90"
          title={currentTitle}
          onClick={() => {
            setTitleDraft(currentTitle)
            setIsEditingTitle(true)
          }}
        >
          {currentTitle}
        </button>
      )}
    </div>
  )

  // 删除会话：内置确认 tooltip，确认后删除。
  const deleteSessionButton = (
    <LxTooltip content="是否删除当前会话" onConfirm={handleDeleteSession} placement="bottom">
      <LxIconButton aria-label="删除会话" disabled={!currentSessionId}>
        <Trash2 className="h-4 w-4" />
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
      } ${isCollapsed ? "w-10 max-w-10 min-w-10 items-center pt-2 px-1.5 pb-1.5" : "p-2 pb-0"}`}
      style={
        isCollapsed
          ? undefined
          : { width: `${width}vw`, minWidth: `${width}vw`, maxWidth: `${width}vw` }
      }
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
        <div className="mb-2 flex w-full items-center justify-between border-b border-white/5">
          <div className="flex min-w-0 items-center gap-1">
            {newChatButton}

            <LxTooltip
              content={
                <ChatHistoryPanel
                  currentSessionId={currentSessionId}
                  sessions={chatSessions}
                  currentProjectId={currentProject?.id}
                  projects={projects}
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
                  void sessionListStore.refresh()
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

            {deleteSessionButton}

            <McpStatusButton />
          </div>

          <div className="flex min-w-0 flex-1 items-center justify-end gap-1">
            {titleControls}

            <LxIconButton
              aria-label="折叠右侧栏"
              title={{ content: "折叠右侧栏", placement: "top" }}
              onClick={() => setIsCollapsed(true)}
            >
              <ChevronRight className="h-4 w-4" />
            </LxIconButton>
          </div>
        </div>
      )}

      <div className={isCollapsed ? "hidden" : "flex-1 min-h-0 overflow-hidden"}>{agentPage}</div>
    </aside>
  )
}
