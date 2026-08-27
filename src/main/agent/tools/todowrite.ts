import type { TodoItem, TodoList } from "@shared/contracts/agent"
import { z } from "zod"
import type { AgentTool } from "../core/types"

// todo 清单项输入 schema（整表替换：模型每次传完整数组）。
const TODO_ITEM_SCHEMA = z.object({
  content: z.string().min(1).max(500).describe("Todo item description"),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .describe(
      "Todo item status: pending / in_progress / completed / cancelled",
    ),
})

// 生成清单摘要文本（作为工具结果回灌模型；details.todos 由 runner 解析落地）。
const formatTodoSummary = (todos: TodoList): string => {
  if (todos.length === 0) {
    return "Todo list cleared."
  }
  const lines = todos.map((todo, index) => `#${index + 1} [${todo.status}] ${todo.content}`)
  return `Todo list (${todos.length} items):\n${lines.join("\n")}`
}

/**
 * 创建 todowrite 工具：整表替换当前任务清单。
 *
 * 纯会话状态（无文件/网络副作用），不进权限门控集；工具本身不碰持久化，
 * 清单由 runner 在 tool_execution_end 解析 details.todos 落地（追加型 todo entry）。
 */
export const createTodoTool = (): AgentTool<z.ZodType<{ todos: TodoItem[] }>> => ({
  name: "todowrite",
  label: "Todo list",
  description:
    "Maintain the current task list: pass the full todos array on each call (full replacement, non-incremental). " +
    "For multi-step tasks (≥2 steps or requiring tool calls), initialize the todo list first and keep statuses updated as progress is made.",
  inputSchema: z.object({
    todos: z.array(TODO_ITEM_SCHEMA).describe("Full todo list (replaces all existing items)"),
  }),
  executionMode: "sequential",
  execute: async (_toolCallId, params) => {
    const todos: TodoList = params.todos
    return {
      content: [{ type: "text", text: formatTodoSummary(todos) }],
      details: { todos },
    }
  },
})
