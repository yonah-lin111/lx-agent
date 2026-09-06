import type { TodoItem, TodoList, TodoStatus } from "@shared/contracts/agent"
import { ChevronDown, ChevronRight, FileText, ListTodo, Terminal } from "lucide-react"
import type React from "react"
import { useState } from "react"
import { LxTag } from "@/components/ui/LxTag"
import { isTodoDone, TodoStatusIcon } from "@/features/agent/components/blocks"
import type { ExecutionToolContent } from "@/features/agent/types"
import { useTranslation } from "@/i18n"
import { FlowItemExpandableText } from "../FlowItemExpandableText"
import { formatDurationMs, formatJsonString } from "../types"

export interface FlowToolTodoProps {
  content: ExecutionToolContent
}

const TODO_STATUSES: readonly TodoStatus[] = ["pending", "in_progress", "completed", "cancelled"]

const getTodos = (args?: Record<string, unknown>): TodoList => {
  if (!args) return []
  const todos = args.todos
  if (!Array.isArray(todos)) return []
  return todos.filter((item): item is TodoItem => {
    if (typeof item !== "object" || item === null) return false
    const { content, status } = item as { content?: unknown; status?: unknown }
    return (
      typeof content === "string" &&
      typeof status === "string" &&
      TODO_STATUSES.includes(status as TodoStatus)
    )
  })
}

export const FlowToolTodo = ({ content }: FlowToolTodoProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [showDebug, setShowDebug] = useState(false)
  const todos = getTodos(content.args)

  const total = todos.length
  const completed = todos.filter((item) => item.status === "completed").length
  const inProgress = todos.filter((item) => item.status === "in_progress").length

  return (
    <div className="agent-execution-flow-tool-todo flex flex-col gap-2.5">
      {/* 头部统计与进度 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 font-mono text-[11px]">
        <div className="flex items-center gap-1.5 text-orange-300">
          <ListTodo className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">{t("agent.todoListProgress", { completed, total })}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {content.durationMs !== undefined && (
            <LxTag size="small" color="default">
              <span className="text-white/60">{formatDurationMs(content.durationMs)}</span>
            </LxTag>
          )}
          {inProgress > 0 && (
            <LxTag size="small" color="amber">
              <span className="text-amber-300 font-medium">
                {inProgress} {t("agent.todoStatusInProgress")}
              </span>
            </LxTag>
          )}
        </div>
      </div>

      {/* 结构化条目清单 */}
      <div className="flex flex-col gap-0.5">
        {todos.length === 0 ? (
          <div className="rounded border border-dashed border-white/10 px-3 py-2 text-center text-xs text-white/40">
            {t("agent.todoEmpty")}
          </div>
        ) : (
          todos.map((todo, index) => {
            const isDone = isTodoDone(todo.status)
            return (
              <div key={index} className="flex items-start gap-2 px-0.5 py-1">
                <div className="flex shrink-0 items-center pt-0.5">
                  <TodoStatusIcon status={todo.status} />
                </div>
                <span
                  className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed ${
                    isDone
                      ? "text-[var(--color-theme-text-muted,rgba(255,255,255,0.35))] line-through"
                      : todo.status === "in_progress"
                        ? "text-orange-200 font-medium"
                        : "text-[var(--color-theme-text,rgba(255,255,255,0.85))]"
                  }`}
                >
                  {todo.content}
                </span>
              </div>
            )
          })
        )}
      </div>

      {/* 底层调试信息折叠区 */}
      <div className="border-t border-[var(--color-theme-border,rgba(255,255,255,0.06))] pt-1 font-mono text-[11px]">
        <button
          type="button"
          onClick={() => setShowDebug((prev) => !prev)}
          className="flex items-center gap-1 text-[11px] text-[var(--color-theme-text-subtle,rgba(255,255,255,0.4))] hover:text-[var(--color-theme-text,rgba(255,255,255,0.8))] transition-colors"
        >
          {showDebug ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{t("agent.todoRawDebug")}</span>
        </button>

        {showDebug && (
          <div className="mt-2 flex flex-col gap-2">
            <div>
              <div className="mb-1 flex items-center justify-between text-white/45">
                <span className="flex items-center gap-1">
                  <Terminal className="h-3 w-3" /> {t("agent.toolArgs")}
                </span>
                {content.toolCallId && (
                  <span className="text-[10px] text-white/30">ID: {content.toolCallId}</span>
                )}
              </div>
              <div className="rounded bg-black/40 p-2 text-sky-200/90">
                <FlowItemExpandableText content={formatJsonString(content.args)} maxLines={3} />
              </div>
            </div>

            {content.result !== undefined && (
              <div>
                <div className="mb-1 flex items-center justify-between text-white/45">
                  <span className="flex items-center gap-1">
                    <FileText className="h-3 w-3" /> {t("agent.toolResult")}
                  </span>
                  {content.isError && (
                    <span className="text-[10px] text-rose-400 font-medium">ERROR</span>
                  )}
                </div>
                <div
                  className={`rounded p-2 ${
                    content.isError
                      ? "border border-rose-500/20 bg-rose-950/20 text-rose-200"
                      : "bg-black/40 text-white/80"
                  }`}
                >
                  <FlowItemExpandableText content={content.result} fallbackText="-" maxLines={3} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
