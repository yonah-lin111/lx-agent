import type { TodoItem, TodoList } from "@shared/contracts/agent"
import { z } from "zod"
import type { AgentTool } from "../core/types"

// todo 清单项输入 schema（整表替换：模型每次传完整数组）。
const TODO_ITEM_SCHEMA = z.object({
  content: z.string().min(1).max(500).describe("任务项内容"),
  status: z
    .enum(["pending", "in_progress", "completed", "cancelled"])
    .describe(
      "任务项状态：pending 待办 / in_progress 进行中 / completed 已完成 / cancelled 已取消",
    ),
})

// 生成清单摘要文本（作为工具结果回灌模型；details.todos 由 runner 解析落地）。
const formatTodoSummary = (todos: TodoList): string => {
  if (todos.length === 0) {
    return "任务清单已清空。"
  }
  const lines = todos.map((todo, index) => `#${index + 1} [${todo.status}] ${todo.content}`)
  return `任务清单（${todos.length} 项）：\n${lines.join("\n")}`
}

/**
 * 创建 todowrite 工具：整表替换当前任务清单。
 *
 * 纯会话状态（无文件/网络副作用），不进权限门控集；工具本身不碰持久化，
 * 清单由 runner 在 tool_execution_end 解析 details.todos 落地（追加型 todo entry）。
 */
export const createTodoTool = (): AgentTool<z.ZodType<{ todos: TodoItem[] }>> => ({
  name: "todowrite",
  label: "任务清单",
  description:
    "维护当前任务清单：每次调用传完整 todos 数组（整表替换，非增量）。" +
    "多步骤任务（≥2 步、需工具调用）先建立清单，随进度更新状态；完成或取消后保持状态同步。",
  inputSchema: z.object({
    todos: z.array(TODO_ITEM_SCHEMA).describe("完整任务清单（替换当前全部项）"),
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
