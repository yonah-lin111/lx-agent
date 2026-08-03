import { Search } from "lucide-react"
import type React from "react"
import { useMemo, useState } from "react"
import { LxInput } from "@/components/ui/LxInput"
import type { ChatSession } from "../types"
import { messageSearchText } from "../utils"

interface ChatHistoryPanelProps {
  sessions: ChatSession[]
  currentSessionId: string | null
  onRestore: (sessionId: string) => void
}

/**
 * 历史对话面板：按标题或消息内容搜索，点击恢复会话。
 */
export const ChatHistoryPanel = ({
  sessions,
  currentSessionId,
  onRestore,
}: ChatHistoryPanelProps): React.JSX.Element => {
  const [query, setQuery] = useState("")

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    if (!keyword) return sessions

    return sessions.filter((session) =>
      `${session.title} ${session.messages.map((message) => messageSearchText(message)).join(" ")}`
        .toLocaleLowerCase()
        .includes(keyword),
    )
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
                type="button"
                className={`flex min-h-7 w-full items-center gap-3 rounded-[3px] px-1.5 text-left text-xs hover:bg-white/5 ${
                  isCurrent ? "bg-white/10 text-white" : "text-white/70"
                }`}
                onClick={() => onRestore(session.id)}
              >
                <span className="min-w-0 truncate">{session.title}</span>
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
