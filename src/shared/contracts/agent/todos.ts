// todo 清单契约：四态状态、清单项与整表替换语义。

// todo 清单项状态（对齐 Claude Code 四态）。
export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled"

// 单个 todo 清单项。
export interface TodoItem {
  content: string
  status: TodoStatus
}

// todo 清单：整表替换语义（模型每次传完整数组，非增量 add/update）。
export type TodoList = TodoItem[]

// 任务清单状态消息：transformContext 每轮注入（模型上下文可见）。
// 不进入 state.messages（不落库、不渲染）；UI 走 todo_updated 事件 + restore 的 todos 字段。
export interface TodoStateMessage {
  role: "todoState"
  todos: TodoList
  timestamp: number
}
