import type { TodoList } from "@shared/contracts/agent"
import { ListTodo } from "lucide-react"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { isTodoDone, TodoStatusIcon } from "@/features/agent/components/blocks"
import { useTranslation } from "@/i18n"

export interface TodoStatusButtonProps {
  todos: TodoList | undefined
}

/**
 * Agent 状态栏任务清单指示：计数 icon（已完成/总数），仅存在未完成任务时显示，
 * 全部完成或空列表隐藏；hover 通过 LxTooltip 展示 todo 列表。
 */
export const TodoStatusButton = ({ todos }: TodoStatusButtonProps): React.JSX.Element | null => {
  const { t } = useTranslation()
  if (!todos || !todos.some((todo) => !isTodoDone(todo.status))) return null
  const done = todos.filter((todo) => isTodoDone(todo.status)).length

  const tooltipContent = (
    <div className="flex min-w-[150px] max-w-[240px] flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-white/50">
        {t("agent.todoCount", { done, total: todos.length })}
      </span>
      {todos.map((todo, index) => (
        <span key={index} className="flex items-start gap-1.5">
          <TodoStatusIcon status={todo.status} className="mt-px" />
          <span
            className={`min-w-0 whitespace-pre-wrap break-words text-xs leading-[18px] ${
              isTodoDone(todo.status) ? "text-white/30 line-through" : "text-orange-300"
            }`}
          >
            {todo.content}
          </span>
        </span>
      ))}
    </div>
  )

  return (
    <LxTooltip content={tooltipContent} contentClassName="!p-2 !whitespace-normal" placement="top">
      <span
        aria-label={t("agent.todoList")}
        className="flex shrink-0 cursor-default items-center gap-1.5 rounded-[4px] px-1.5 py-0.5 text-xs text-orange-300/90 transition-colors hover:bg-white/5"
      >
        <ListTodo className="h-3.5 w-3.5 shrink-0" />
        <span className="tabular-nums">
          {done}/{todos.length}
        </span>
      </span>
    </LxTooltip>
  )
}
