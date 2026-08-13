import type { TodoItem, TodoList, TodoStatus } from "@shared/contracts/agent"
import { CornerDownRight, ListTodo } from "lucide-react"
import type React from "react"
import { isTodoDone, TodoStatusIcon } from "@/features/agent/components/TodoStatusIcon"
import type { ChatBlock } from "@/features/agent/types"

// 工具调用块类型。
type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// todo 工具调用展示组件属性类型。
type AgentTodoCallBlockProps = {
  // 单次 todowrite 工具调用（args.todos 为整表替换后的完整清单）。
  toolCall: ToolCallBlock
}

// 合法 todo 状态（用于校验 args.todos 中的条目）。
const TODO_STATUSES: readonly TodoStatus[] = ["pending", "in_progress", "completed", "cancelled"]

// 从 todowrite 调用参数中提取完整清单（args 由 main 侧 zod 校验，此处做展示兜底）。
const getTodos = (args: Record<string, unknown>): TodoList => {
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

/**
 * AgentTodoCallBlock - 渲染 todowrite 工具调用：header 展示清单图标，正文逐条渲染当前清单
 * （条目样式与 TodoDock 一致），整表替换语义下每条调用即完整快照，独立成组不参与执行折叠。
 */
export const AgentTodoCallBlock = ({
  toolCall,
}: AgentTodoCallBlockProps): React.JSX.Element | null => {
  const todos = getTodos(toolCall.args)
  if (todos.length === 0) return null

  return (
    <div className="my-0.5 min-w-0">
      <div className="flex items-center gap-1">
        <ListTodo className="h-3.5 w-3.5 shrink-0 text-orange-300" />
        <span className="text-[12px] font-bold text-orange-300">任务清单</span>
      </div>
      <div className="mt-1 flex min-w-0 items-start gap-1.5 pl-1">
        <CornerDownRight className="mt-[2px] h-3 w-3 shrink-0 text-white/45" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {todos.map((todo, index) => (
            <div key={index} className="flex min-w-0 items-start gap-1.5 text-left">
              {/* mt 对齐第一行文字（icon 14px 相对内容行高 20px 垂直居中）。 */}
              <TodoStatusIcon status={todo.status} className="mt-[3px]" />
              <span
                className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] leading-[20px] ${
                  isTodoDone(todo.status) ? "text-white/40 line-through" : "text-white/90"
                }`}
              >
                {todo.content}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
