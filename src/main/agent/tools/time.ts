import { z } from "zod"
import type { AgentTool } from "../core/types"

// 创建 time 工具：返回本机本地时间与时区，供模型感知时间上下文。
export const createTimeTool = (): AgentTool<z.ZodType<Record<string, never>>> => ({
  name: "time",
  label: "Current time",
  description: "Get the current local time and timezone on the machine. Use when you need to know the current date, time, or timezone.",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    const local = now.toLocaleString("en-US", { hour12: false })
    const offsetMinutes = -now.getTimezoneOffset()
    const offsetSign = offsetMinutes >= 0 ? "+" : "-"
    const offsetHours = String(Math.floor(Math.abs(offsetMinutes) / 60)).padStart(2, "0")
    const offsetMin = String(Math.abs(offsetMinutes) % 60).padStart(2, "0")
    const text = `Local time: ${local} (Timezone: ${timeZone}, UTC offset: ${offsetSign}${offsetHours}:${offsetMin}, ISO: ${now.toISOString()})`
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
