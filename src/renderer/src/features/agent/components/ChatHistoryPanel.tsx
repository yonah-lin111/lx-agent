import type { AgentSessionSummary } from "@shared/contracts/agent"
import { Search } from "lucide-react"
import type React from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { sessionListStore } from "../hooks/sessionListStore"

interface ChatHistoryPanelProps {
  sessions: AgentSessionSummary[]
  currentSessionId: string | null
  // 当前打开的项目 id（Current Project tag 筛选用）。
  currentProjectId?: string
  // 项目列表（Project tag 的 LxSelect 选项）。
  projects: { id: string; name: string }[]
  onRestore: (sessionId: string) => void
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
}: ChatHistoryPanelProps): React.JSX.Element => {
  const [query, setQuery] = useState("")
  const [projectTag, setProjectTag] = useState<ProjectTag>("all")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const pendingSessionIds = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getPendingSessionIds,
  )

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
    <div className="flex w-72 flex-col gap-2" aria-label="历史对话">
      <LxInput
        aria-label="搜索历史对话"
        placeholder="搜索历史对话"
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
          placeholder="请选择项目"
          onChange={setSelectedProjectId}
          options={projectOptions}
          zIndex={1_000_000}
        />
      )}
      <div className="max-h-72 overflow-y-auto custom-scrollbar">
        <div className="space-y-0.5">
          {filteredSessions.map((session) => {
            const isCurrent = session.id === currentSessionId
            return (
              <button
                key={session.id}
                disabled={isCurrent}
                type="button"
                className={`flex min-h-7 w-full items-center gap-3 rounded-[3px] px-1.5 text-left text-xs ${
                  isCurrent
                    ? "cursor-default bg-white/10 text-white"
                    : "text-white/70 hover:bg-white/5"
                }`}
                onClick={() => onRestore(session.id)}
              >
                {pendingSessionIds.has(session.id) ? (
                  <span className="inline-block h-3 w-24 animate-pulse rounded-[3px] bg-white/[0.08]" />
                ) : (
                  <span className="min-w-0 truncate">{session.title}</span>
                )}
              </button>
            )
          })}
        </div>
        {filteredSessions.length === 0 && (
          <div className="py-4 text-center text-xs text-white/45">未找到匹配的会话</div>
        )}
      </div>
    </div>
  )
}
