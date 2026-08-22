import type { AgentSessionSummary } from "@shared/contracts/agent"
import {
  ChevronRight,
  Copy,
  Download,
  Edit3,
  FileCode,
  FileText,
  Globe,
  MessageSquare,
  MoreHorizontal,
  Search,
  Trash2,
} from "lucide-react"
import type React from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenuItem, LxMenuSeparator } from "@/components/ui/LxMenu"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { agentApi } from "@/features/agent/api/agentApi"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import { useTranslation } from "@/i18n"

interface ChatHistoryPanelProps {
  sessions: AgentSessionSummary[]
  currentSessionId: string | null
  // 当前打开的项目 id（Current Project tag 筛选用）。
  currentProjectId?: string
  // 项目列表（Project tag 的 LxSelect 选项）。
  projects: { id: string; name: string }[]
  onRestore: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

// 项目 tag（英文单选）：全部 / 指定项目 / 当前项目。
type ProjectTag = "all" | "project" | "current"
const PROJECT_TAGS: { value: ProjectTag; label: string }[] = [
  { value: "all", label: "All" },
  { value: "project", label: "Project" },
  { value: "current", label: "Current Project" },
]

/**
 * 历史对话面板：全量会话 + 项目 tag 客户端过滤 + 按标题搜索，点击恢复会话。
 */
export const ChatHistoryPanel = ({
  sessions,
  currentSessionId,
  currentProjectId,
  projects,
  onRestore,
  onDelete,
}: ChatHistoryPanelProps): React.JSX.Element => {
  const [query, setQuery] = useState("")
  const [projectTag, setProjectTag] = useState<ProjectTag>("all")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const { success: successToast, error: errorToast } = useLxToast()
  const { t } = useTranslation()
  const pendingSessionIds = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getPendingSessionIds,
  )
  // 正在编辑标题的会话 id（点击条目右侧编辑 icon 进入，行内输入框编辑）。
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  // 更多操作菜单状态（哪个会话的更多菜单处于打开状态）。
  const [activeMoreSessionId, setActiveMoreSessionId] = useState<string | null>(null)
  // 删除二次确认状态（记录正在确认删除的会话 id）。
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)
  const [titleDraft, setTitleDraft] = useState("")

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

  const projectOptions: LxSelectOption<string>[] = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }))

  return (
    <div className="flex w-72 flex-col gap-2" aria-label={t("agent.historyTitle")}>
      <LxInput
        aria-label={t("agent.searchHistory")}
        placeholder={t("agent.searchHistory")}
        prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
        size="xs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-1">
        {PROJECT_TAGS.map(({ value, label }) => (
          <LxTag
            key={value}
            size="small"
            highlighted={projectTag === value}
            onClick={() => setProjectTag(value)}
          >
            {label}
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
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {filteredSessions.map((session) => {
            const isCurrent = session.id === currentSessionId
            const isEditing = editingSessionId === session.id
            return (
              <div
                key={session.id}
                className={`group flex h-6 w-full items-center gap-1 rounded-[3px] px-1.5 text-left text-xs ${
                  isCurrent
                    ? "cursor-default bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5"
                }`}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    aria-label={t("agent.editSessionTitle")}
                    className="h-full min-w-0 flex-1 border-b border-white/20 bg-transparent px-0.5 text-xs text-white/80 outline-none"
                    maxLength={40}
                    value={titleDraft}
                    onBlur={commitTitle}
                    onChange={(event) => setTitleDraft(event.target.value)}
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
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isCurrent}
                      className="flex h-full min-w-0 flex-1 items-center truncate text-left"
                      onClick={() => onRestore(session.id)}
                    >
                      {pendingSessionIds.has(session.id) ? (
                        <span className="inline-block h-3 w-24 animate-pulse rounded-[3px] bg-white/[0.08]" />
                      ) : (
                        <span className="block truncate">{session.title}</span>
                      )}
                    </button>
                    <LxTooltip
                      open={activeMoreSessionId === session.id}
                      onOpenChange={(open) => {
                        setActiveMoreSessionId(open ? session.id : null)
                        if (!open) {
                          setDeletingSessionId(null)
                        }
                      }}
                      placement="bottom"
                      trigger="click"
                      contentClassName="!p-1"
                      content={
                        <div className="flex w-max min-w-32 flex-col gap-0.5" role="menu">
                          <LxTooltip
                            placement="right"
                            trigger="hover"
                            contentClassName="!p-1"
                            content={
                              <div className="flex w-max min-w-36 flex-col gap-0.5" role="menu">
                                <LxMenuItem
                                  leading={<Globe className="h-3.5 w-3.5 text-[#38bdf8]" />}
                                  onClick={() => {
                                    setActiveMoreSessionId(null)
                                    void agentApi
                                      .exportSession({
                                        sessionId: session.id,
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
                                    setActiveMoreSessionId(null)
                                    void agentApi
                                      .exportSession({
                                        sessionId: session.id,
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
                                    setActiveMoreSessionId(null)
                                    void agentApi
                                      .exportSession({
                                        sessionId: session.id,
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
                                    setActiveMoreSessionId(null)
                                    void agentApi
                                      .copySession({
                                        sessionId: session.id,
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
                                    setActiveMoreSessionId(null)
                                    void agentApi
                                      .copySession({
                                        sessionId: session.id,
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
                              setActiveMoreSessionId(null)
                              setTitleDraft(session.title)
                              setEditingSessionId(session.id)
                            }}
                          >
                            {t("agent.renameSession")}
                          </LxMenuItem>
                          <LxMenuItem
                            active={deletingSessionId === session.id}
                            danger
                            leading={
                              <Trash2
                                className={`h-3.5 w-3.5 ${
                                  deletingSessionId === session.id
                                    ? "text-white"
                                    : "text-rose-400/80"
                                }`}
                              />
                            }
                            onClick={() => {
                              if (deletingSessionId !== session.id) {
                                setDeletingSessionId(session.id)
                                return
                              }
                              setActiveMoreSessionId(null)
                              setDeletingSessionId(null)
                              onDelete(session.id)
                            }}
                          >
                            {deletingSessionId === session.id
                              ? t("common.confirmDelete")
                              : t("common.delete")}
                          </LxMenuItem>
                        </div>
                      }
                    >
                      <LxIconButton
                        aria-label={t("common.more")}
                        className={`transition-opacity ${
                          activeMoreSessionId === session.id
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                        }`}
                        disabled={pendingSessionIds.has(session.id)}
                        highlighted={activeMoreSessionId === session.id}
                        size="small"
                        title={{ content: t("common.more"), placement: "bottom" }}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </LxIconButton>
                    </LxTooltip>
                  </>
                )}
              </div>
            )
          })}
        </div>
        {filteredSessions.length === 0 && (
          <div className="py-4 text-center text-xs text-white/45">{t("agent.noHistory")}</div>
        )}
      </div>
    </div>
  )
}
