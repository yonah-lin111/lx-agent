import { z } from "zod"
import type { AgentTool } from "../core/types"

// 创建 time 工具：返回本机本地时间与时区，供模型感知时间上下文。
export const createTimeTool = (): AgentTool<z.ZodType<Record<string, never>>> => ({
  name: "time",
  label: "当前时间",
  description: "获取本机当前本地时间及其时区。当需要感知当前日期、时间或时区时使用。",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const local = now.toLocaleString("zh-CN", { hour12: false })
    const offsetMinutes = -now.getTimezoneOffset()
    const offsetSign = offsetMinutes >= 0 ? "+" : "-"
    const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0")
    const offsetMin = String(Math.abs(offsetMinutes) % 60).padStart(2, "0")
    const text = `本地时间：${local}（时区：${timeZone}，UTC 偏移：${offsetSign}${offsetHours}:${offsetMin}，ISO：${now.toISOString()}）`
    return {
      content: [{ type: "text", text }],
      details: {
        local,
        timeZone,
        utcOffset: `${offsetSign}${offsetHours}:${offsetMin}`,
        iso: now.toISOString(),
      },
    }
  },
})
