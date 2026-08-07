import type { AgentSessionSummary } from "@shared/contracts/agent"
import { Search } from "lucide-react"
import type React from "react"
import { useMemo, useState, useSyncExternalStore } from "react"
import { LxInput } from "@/components/ui/LxInput"
import { sessionListStore } from "../hooks/sessionListStore"

interface ChatHistoryPanelProps {
  sessions: AgentSessionSummary[]
  currentSessionId: string | null
  onRestore: (sessionId: string) => void
}

/**
 * 历史对话面板：按标题搜索，点击恢复会话。
 */
export const ChatHistoryPanel = ({
  sessions,
  currentSessionId,
  onRestore,
}: ChatHistoryPanelProps): React.JSX.Element => {
  const [query, setQuery] = useState("")
  const pendingSessionIds = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getPendingSessionIds,
  )

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return sessions

    return sessions.filter((session) => session.title.toLocaleLowerCase().includes(keyword))
  }, [query, sessions])

  return (
    <div className="flex w-60 flex-col gap-2" aria-label="历史对话">
      <LxInput
        aria-label="搜索历史对话"
        placeholder="搜索历史对话"
        prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
        size="xs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
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
