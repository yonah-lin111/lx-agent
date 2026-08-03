import { z } from "zod"
import type { AgentTool } from "../core/types"

// 创建 time 工具：返回当前时间，供模型感知时间上下文。
export const createTimeTool = (): AgentTool<z.ZodType<Record<string, never>>> => ({
  name: "time",
  label: "当前时间",
  description: "获取当前时间（ISO 8601 格式）。当需要感知当前日期或时间时使用。",
  inputSchema: z.object({}),
  execute: async () => ({
    content: [{ type: "text", text: new Date().toISOString() }],
    details: { iso: new Date().toISOString() },
  }),
})
