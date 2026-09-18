import type { AgentSessionSummary } from "@shared/contracts/agent"
import {
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileCode,
  FileText,
  Globe,
  History,
  ListChecks,
  MessageSquare,
  Pin,
  PinOff,
  Search,
  Trash2,
  X,
} from "lucide-react"
import type React from "react"
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenu, LxMenuSeparator } from "@/components/ui/LxMenu"
import { LxMenuItem } from "@/components/ui/LxMenuItem"
import { LxNavItem } from "@/components/ui/LxNavItem"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { type TranslationKey, useTranslation } from "@/i18n"

interface AgentHistoryPanelProps {
  // 面板是否展开（false = 上移收起，保持挂载）。
  isOpen: boolean
  // 关闭面板。
  onClose: () => void
  // 全量历史会话。
  sessions: AgentSessionSummary[]
  // 当前激活会话 id（高亮展示并禁用恢复）。
  currentSessionId: string | null
  // 当前打开的项目 id（Current Project tag 筛选用）。
  currentProjectId?: string
  // 项目列表（Project tag 的 LxSelect 选项）。
  projects: { id: string; name: string }[]
  // 恢复会话。
  onRestore: (sessionId: string) => void
  // 删除会话。
  onDelete: (sessionId: string) => void
  // 多选批量删除；返回 false = 被守卫拒绝或失败，面板保留多选态。
  onDeleteMany: (sessionIds: string[]) => Promise<boolean>
}

// 项目筛选 tag（单选）：全部 / 指定项目 / 当前项目。
type ProjectTag = "all" | "project" | "current"
const PROJECT_TAGS: { value: ProjectTag; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "agent.historyFilterAll" },
  { value: "project", labelKey: "agent.historyFilterProject" },
  { value: "current", labelKey: "agent.historyFilterCurrentProject" },
]

// 触底分页：默认渲染条数与每次追加条数（仅普通会话参与，置顶项恒显）。
const HISTORY_PAGE_SIZE = 30
const HISTORY_PAGE_STEP = 20

/**
 * AgentHistoryPanel - 从顶部向下展开、恰好覆盖消息列表的历史会话面板。
 * 打开方式与 AgentSubagentPanel 一致；消息列表保持挂载（不卸载）。
 */
export const AgentHistoryPanel = ({
  isOpen,
  onClose,
  sessions,
  currentSessionId,
  currentProjectId,
  projects,
  onRestore,
  onDelete,
  onDeleteMany,
}: AgentHistoryPanelProps): React.JSX.Element => {
  const [query, setQuery] = useState("")
  const [projectTag, setProjectTag] = useState<ProjectTag>("all")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const { success: successToast, error: errorToast } = useLxToast()
  const { t } = useTranslation()
  const pendingSessionIds = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getPendingSessionIds,
  )
  // 正在编辑标题的会话 id（右键菜单进入，行内输入框编辑）。
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  // 右键菜单目标：触发会话快照、视口坐标与滚动关闭锚点（关闭动画期间保留菜单内容）。
  const [menuTarget, setMenuTarget] = useState<{
    session: AgentSessionSummary
    x: number
    y: number
    anchor: HTMLElement | null
  } | null>(null)
  // 右键菜单是否打开。
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  // 删除二次确认状态（记录正在确认删除的会话 id）。
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState("")
  // 多选模式：进入后行内显示复选框，点击行切换勾选。
  const [isSelectMode, setIsSelectMode] = useState(false)
  // 多选勾选的会话 id 集合。
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  // 触底分页：当前渲染的普通会话条数（置顶项不占名额）。
  const [visibleCount, setVisibleCount] = useState(HISTORY_PAGE_SIZE)
  // 会话列表滚动容器（打开面板时用于将当前会话居中）。
  const listRef = useRef<HTMLDivElement>(null)
  // 触底哨兵：进入视口后追加一页。
  const loadMoreRef = useRef<HTMLDivElement>(null)
  // 本次打开是否已完成居中（避免筛选/列表刷新反复回拉滚动条）。
  const centeredRef = useRef(false)

  // 提交标题修改：写入 DB 并本地同步，随后退出编辑态。
  const commitTitle = (): void => {
    const sessionId = editingSessionId
    setEditingSessionId(null)
    if (!sessionId) return
    const trimmed = titleDraft.trim()
    const original = sessions.find((session) => session.id === sessionId)?.title
    if (!trimmed || original === undefined || trimmed === original) return
    void agentApi
      .renameSession(sessionId, trimmed)
      .then(() => sessionListStore.updateSessionTitle(sessionId, trimmed))
      .catch(() => {
        // 重命名失败：保持原标题。
      })
  }

  // 切换会话置顶：写入 DB 成功后本地同步并重排，失败保持原状。
  const toggleSessionPinned = (session: AgentSessionSummary): void => {
    const pinned = !session.pinned
    void agentApi
      .setSessionPinned(session.id, pinned)
      .then(() => sessionListStore.updateSessionPinned(session.id, pinned))
      .catch(() => {
        errorToast(t("common.failed"))
      })
  }

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    return sessions.filter((session) => {
      // 项目 tag 过滤。
      if (projectTag === "project") {
        // 未选择项目时置空（select 提示请选择），避免误显示 projectId 为 null 的页面会话。
        if (selectedProjectId === null) return false
        if (session.projectId !== selectedProjectId) return false
      }
      if (projectTag === "current" && session.projectId !== currentProjectId) return false
      // 标题搜索。
      if (keyword && !session.title.toLocaleLowerCase().includes(keyword)) return false
      return true
    })
  }, [query, sessions, projectTag, selectedProjectId, currentProjectId])

  // 置顶项与普通项分流：置顶恒显，普通项按 visibleCount 截断。
  const { pinnedSessions, regularSessions } = useMemo(() => {
    const pinned: AgentSessionSummary[] = []
    const regular: AgentSessionSummary[] = []
    for (const session of filteredSessions) {
      if (session.pinned) pinned.push(session)
      else regular.push(session)
    }
    return { pinnedSessions: pinned, regularSessions: regular }
  }, [filteredSessions])

  const visibleRegularSessions = useMemo(
    () => regularSessions.slice(0, visibleCount),
    [regularSessions, visibleCount],
  )
  const hasMoreRegular = regularSessions.length > visibleCount

  // 打开面板时重置筛选与多选/分页态，确保当前会话一定在列表中（关闭态不卸载，需手动复位）。
  useEffect(() => {
    if (!isOpen) return
    setQuery("")
    setProjectTag("all")
    setSelectedProjectId(null)
    setVisibleCount(HISTORY_PAGE_SIZE)
    setIsSelectMode(false)
    setSelectedSessionIds(new Set())
  }, [isOpen])

  // 筛选变化时分页重置回第一页。
  useEffect(() => {
    setVisibleCount(HISTORY_PAGE_SIZE)
  }, [query, projectTag, selectedProjectId])

  // 当前会话超出分页范围时扩页纳入，保证其始终可见并可被居中。
  useEffect(() => {
    if (!isOpen || !currentSessionId) return
    const index = regularSessions.findIndex((session) => session.id === currentSessionId)
    if (index < 0 || index < visibleCount) return
    setVisibleCount(Math.ceil((index + 1) / HISTORY_PAGE_STEP) * HISTORY_PAGE_STEP)
  }, [isOpen, currentSessionId, regularSessions, visibleCount])

  // 触底分页：哨兵进入滚动视口时追加一页（列表不足一屏时浏览器会连续触发直至填满）。
  useEffect(() => {
    if (!isOpen || !hasMoreRegular) return
    const sentinel = loadMoreRef.current
    const container = listRef.current
    if (!sentinel || !container) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => count + HISTORY_PAGE_STEP)
        }
      },
      { root: container, rootMargin: "120px 0px" },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [isOpen, hasMoreRegular, filteredSessions])

  // 打开面板时将当前会话滚动到列表视口中间，无需手动调整滚动条（每次打开只居中一次）。
  useEffect(() => {
    if (!isOpen) {
      centeredRef.current = false
      return
    }
    if (centeredRef.current) return
    const container = listRef.current
    if (!container) return
    const activeRow = container.querySelector<HTMLElement>('[data-session-current="true"]')
    if (!activeRow) return
    const containerRect = container.getBoundingClientRect()
    const activeRect = activeRow.getBoundingClientRect()
    container.scrollTop +=
      activeRect.top - containerRect.top - (containerRect.height - activeRect.height) / 2
    centeredRef.current = true
  }, [isOpen, currentSessionId, filteredSessions])

  // 面板关闭时收起右键菜单。
  useEffect(() => {
    if (!isOpen) setIsMenuOpen(false)
  }, [isOpen])

  // 关闭右键菜单并复位删除确认态。
  const closeSessionMenu = (): void => {
    setIsMenuOpen(false)
    setDeletingSessionId(null)
  }

  // 打开会话右键菜单（多选模式或标题生成中的行不响应）。
  const openSessionMenu = (session: AgentSessionSummary, event: React.MouseEvent): void => {
    event.preventDefault()
    if (isSelectMode || pendingSessionIds.has(session.id)) return
    setDeletingSessionId(null)
    setMenuTarget({
      session,
      x: event.clientX,
      y: event.clientY,
      anchor: event.currentTarget as HTMLElement,
    })
    setIsMenuOpen(true)
  }

  // 进入多选模式：清空旧选择与菜单。
  const enterSelectMode = (): void => {
    closeSessionMenu()
    setEditingSessionId(null)
    setIsSelectMode(true)
    setSelectedSessionIds(new Set())
  }

  // 退出多选模式：清空选择并重置分页。
  const exitSelectMode = (): void => {
    setIsSelectMode(false)
    setSelectedSessionIds(new Set())
    setVisibleCount(HISTORY_PAGE_SIZE)
  }

  // 切换单条勾选。
  const toggleSessionSelected = (sessionId: string, checked: boolean): void => {
    setSelectedSessionIds((previous) => {
      const next = new Set(previous)
      if (checked) next.add(sessionId)
      else next.delete(sessionId)
      return next
    })
  }

  // 批量删除（二次确认由删除按钮的 Tooltip 承担）；失败保留多选态。
  const handleDeleteSelected = (): void => {
    const sessionIds = Array.from(selectedSessionIds)
    if (sessionIds.length === 0) return
    void onDeleteMany(sessionIds).then((ok) => {
      if (!ok) return
      exitSelectMode()
    })
  }

  const projectOptions: LxSelectOption<string>[] = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }))

  // 菜单内容取快照会话；关闭动画期间 menuTarget 保留，内容不闪空。
  const menuSession = menuTarget?.session

  return (
    <div
      role="dialog"
      aria-label={t("agent.historyTitle")}
      inert={!isOpen}
      className="agent-history-panel-dialog absolute inset-0 z-20 flex flex-col bg-[#262626] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        transform: isOpen ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.28s cubic-bezier(0.2, 0.85, 0.2, 1)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* 面板头部：普通态 = 历史标题 + 多选/关闭；多选态 = 已选计数 + 删除/取消。 */}
      <div className="agent-history-panel-header flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        {isSelectMode ? (
          <>
            <span className="min-w-0 truncate text-xs text-white/70">
              {t("agent.selectedSessionsCount", { count: selectedSessionIds.size })}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <LxIconButton
                size="small"
                preset="delete"
                disabled={selectedSessionIds.size === 0}
                aria-label={t("agent.deleteSelectedSessions")}
                title={{
                  content: t("agent.deleteSessionsConfirm", {
                    count: selectedSessionIds.size,
                  }),
                  placement: "bottom",
                  onConfirm: handleDeleteSelected,
                }}
              />
              <LxIconButton
                size="small"
                variant="ghost"
                aria-label={t("common.cancel")}
                title={{ content: t("common.cancel"), placement: "bottom" }}
                onClick={exitSelectMode}
              >
                <X />
              </LxIconButton>
            </div>
          </>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-1.5">
              <History className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              <span className="truncate text-sm text-white/80">{t("agent.historyTitle")}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <LxIconButton
                size="small"
                aria-label={t("agent.selectSessions")}
                title={{ content: t("agent.selectSessions"), placement: "bottom" }}
                onClick={enterSelectMode}
              >
                <ListChecks />
              </LxIconButton>
              <LxIconButton
                size="small"
                aria-label={t("agent.closeHistoryPanel")}
                title={{ content: t("agent.collapsePanel"), placement: "bottom" }}
                onClick={onClose}
              >
                <X />
              </LxIconButton>
            </div>
          </>
        )}
      </div>

      {/* 面板内容：搜索 + 项目筛选 + 会话列表。 */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-3 py-2">
        <LxInput
          aria-label={t("agent.searchHistory")}
          placeholder={t("agent.searchHistory")}
          prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
          size="small"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-1">
          {PROJECT_TAGS.map(({ value, labelKey }) => (
            <LxTag
              key={value}
              size="small"
              highlighted={projectTag === value}
              onClick={() => setProjectTag(value)}
            >
              {t(labelKey)}
            </LxTag>
          ))}
        </div>
        {projectTag === "project" && (
          <LxSelect
            size="small"
            value={selectedProjectId ?? ""}
            placeholder={t("agent.selectProjectPlaceholder")}
            onChange={setSelectedProjectId}
            options={projectOptions}
            zIndex={1_000_000}
          />
        )}
        <div ref={listRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-0.5">
            {[...pinnedSessions, ...visibleRegularSessions].map((session) => {
              const isCurrent = session.id === currentSessionId
              const isEditing = editingSessionId === session.id
              const isSelected = selectedSessionIds.has(session.id)
              const isSelectable = !pendingSessionIds.has(session.id)
              const pinnedRowClass = session.pinned
                ? `agent-history-session-row--pinned ${
                    isCurrent ? "" : "bg-[var(--color-theme-surface-hover)]"
                  }`
                : ""
              return (
                <LxNavItem
                  key={session.id}
                  level={2}
                  aria-current={isCurrent ? "page" : undefined}
                  data-session-current={isCurrent ? "true" : undefined}
                  data-pinned={session.pinned ? "true" : undefined}
                  data-menu-open={
                    isMenuOpen && menuTarget?.session.id === session.id ? "true" : undefined
                  }
                  prefix={
                    isSelectMode ? (
                      <LxCheckbox
                        size="small"
                        checked={isSelected}
                        disabled={!isSelectable}
                        aria-label={session.title}
                        onChange={(checked) => toggleSessionSelected(session.id, checked)}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : undefined
                  }
                  suffix={
                    session.pinned ? (
                      <Pin
                        className="h-3.5 w-3.5 shrink-0 text-[var(--color-theme-text-muted)]"
                        fill="currentColor"
                        aria-hidden="true"
                      />
                    ) : undefined
                  }
                  className={`agent-history-session-row ${pinnedRowClass} ${
                    isCurrent
                      ? `agent-history-session-row--current bg-white/5 text-white ${
                          isSelectMode ? "" : "cursor-default"
                        }`
                      : session.pinned
                        ? "text-[var(--color-theme-text)]"
                        : "text-white/70"
                  }`}
                  onClick={() => {
                    if (isSelectMode) {
                      if (isSelectable) toggleSessionSelected(session.id, !isSelected)
                      return
                    }
                    if (isCurrent) return
                    onRestore(session.id)
                  }}
                  onContextMenu={(event) => {
                    if (isEditing) return
                    openSessionMenu(session, event)
                  }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      aria-label={t("agent.editSessionTitle")}
                      className="h-full min-w-0 flex-1 border-b border-white/20 bg-transparent px-0.5 text-sm text-white/80 outline-none"
                      maxLength={40}
                      value={titleDraft}
                      onBlur={commitTitle}
                      onChange={(event) => setTitleDraft(event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                      onFocus={(event) => event.target.select()}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === "Escape") {
                          setEditingSessionId(null)
                          return
                        }
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                          commitTitle()
                        }
                      }}
                    />
                  ) : pendingSessionIds.has(session.id) ? (
                    <span className="inline-block h-3 w-24 animate-pulse rounded-[3px] bg-white/[0.08]" />
                  ) : (
                    <span className="agent-history-session-title min-w-0 flex-1 truncate select-none">
                      {session.title}
                    </span>
                  )}
                </LxNavItem>
              )
            })}
          </div>
          {hasMoreRegular && <div ref={loadMoreRef} aria-hidden="true" className="h-px w-full" />}
          {filteredSessions.length === 0 && (
            <div className="py-4 text-center text-xs text-white/45">{t("agent.noHistory")}</div>
          )}
        </div>
      </div>

      {/* 会话右键菜单：置顶 + 导出子菜单 + 重命名 + 删除（二次确认）。 */}
      <LxMenu
        ariaLabel={t("common.more")}
        anchor={menuTarget?.anchor ?? null}
        isOpen={isMenuOpen}
        x={menuTarget?.x ?? 0}
        y={menuTarget?.y ?? 0}
        onClose={closeSessionMenu}
      >
        {menuSession && (
          <>
            <LxMenuItem
              leading={
                menuSession.pinned ? (
                  <PinOff className="h-3.5 w-3.5 text-[var(--color-theme-text-muted)]" />
                ) : (
                  <Pin className="h-3.5 w-3.5 text-white/45" />
                )
              }
              onClick={() => {
                const session = menuSession
                closeSessionMenu()
                toggleSessionPinned(session)
              }}
            >
              {menuSession.pinned ? t("agent.unpinSession") : t("agent.pinSession")}
            </LxMenuItem>
            <LxMenuSeparator />
            <LxTooltip
              placement="right"
              trigger="hover"
              contentClassName="!p-1"
              content={
                <div className="flex w-max min-w-36 flex-col gap-0.5" role="menu">
                  <LxMenuItem
                    leading={<Globe className="h-3.5 w-3.5 text-[#38bdf8]" />}
                    onClick={() => {
                      closeSessionMenu()
                      void agentApi
                        .exportSession({
                          sessionId: menuSession.id,
                          format: "html",
                          openAfterExport: true,
                        })
                        .then((res) => {
                          if (res.ok && !res.canceled && res.filePath) {
                            successToast(`HTML: ${res.filePath}`)
                          } else if (!res.ok) {
                            errorToast(res.error || t("common.failed"))
                          }
                        })
                    }}
                  >
                    HTML (.html)
                  </LxMenuItem>
                  <LxMenuItem
                    leading={<FileText className="h-3.5 w-3.5 text-[#34d399]" />}
                    onClick={() => {
                      closeSessionMenu()
                      void agentApi
                        .exportSession({
                          sessionId: menuSession.id,
                          format: "markdown",
                          openAfterExport: true,
                        })
                        .then((res) => {
                          if (res.ok && !res.canceled && res.filePath) {
                            successToast(`Markdown: ${res.filePath}`)
                          } else if (!res.ok) {
                            errorToast(res.error || t("common.failed"))
                          }
                        })
                    }}
                  >
                    Markdown (.md)
                  </LxMenuItem>
                  <LxMenuItem
                    leading={<FileCode className="h-3.5 w-3.5 text-[#fbbf24]" />}
                    onClick={() => {
                      closeSessionMenu()
                      void agentApi
                        .exportSession({
                          sessionId: menuSession.id,
                          format: "jsonl",
                          openAfterExport: true,
                        })
                        .then((res) => {
                          if (res.ok && !res.canceled && res.filePath) {
                            successToast(`JSONL: ${res.filePath}`)
                          } else if (!res.ok) {
                            errorToast(res.error || t("common.failed"))
                          }
                        })
                    }}
                  >
                    JSONL (.jsonl)
                  </LxMenuItem>
                  <LxMenuSeparator />
                  <LxMenuItem
                    leading={<Copy className="h-3.5 w-3.5 text-white/60" />}
                    onClick={() => {
                      closeSessionMenu()
                      void agentApi
                        .copySession({
                          sessionId: menuSession.id,
                          target: "markdown",
                        })
                        .then((res) => {
                          if (res.ok && res.text) {
                            void navigator.clipboard.writeText(res.text).then(() => {
                              successToast(t("common.copied"))
                            })
                          } else if (!res.ok) {
                            errorToast(res.error || t("common.failed"))
                          }
                        })
                    }}
                  >
                    Copy Markdown
                  </LxMenuItem>
                  <LxMenuItem
                    leading={<MessageSquare className="h-3.5 w-3.5 text-white/60" />}
                    onClick={() => {
                      closeSessionMenu()
                      void agentApi
                        .copySession({
                          sessionId: menuSession.id,
                          target: "last_assistant",
                        })
                        .then((res) => {
                          if (res.ok && res.text) {
                            void navigator.clipboard.writeText(res.text).then(() => {
                              successToast(t("common.copied"))
                            })
                          } else if (!res.ok) {
                            errorToast(res.error || t("common.failed"))
                          }
                        })
                    }}
                  >
                    Copy Last Reply
                  </LxMenuItem>
                </div>
              }
            >
              <LxMenuItem
                leading={<Download className="h-3.5 w-3.5 text-white/45" />}
                trailing={<ChevronRight className="h-3.5 w-3.5 text-white/35" />}
              >
                {t("agent.exportSession")}
              </LxMenuItem>
            </LxTooltip>
            <LxMenuItem
              leading={<Edit3 className="h-3.5 w-3.5 text-white/45" />}
              onClick={() => {
                const sessionId = menuSession.id
                closeSessionMenu()
                setTitleDraft(menuSession.title)
                setEditingSessionId(sessionId)
              }}
            >
              {t("agent.renameSession")}
            </LxMenuItem>
            <LxMenuItem
              active={deletingSessionId === menuSession.id}
              danger
              leading={
                <Trash2
                  className={`h-3.5 w-3.5 ${
                    deletingSessionId === menuSession.id ? "text-white" : "text-rose-400/80"
                  }`}
                />
              }
              onClick={() => {
                if (deletingSessionId !== menuSession.id) {
                  setDeletingSessionId(menuSession.id)
                  return
                }
                const sessionId = menuSession.id
                closeSessionMenu()
                onDelete(sessionId)
              }}
            >
              {deletingSessionId === menuSession.id
                ? t("common.confirmDelete")
                : t("common.delete")}
            </LxMenuItem>
          </>
        )}
      </LxMenu>
    </div>
  )
}
