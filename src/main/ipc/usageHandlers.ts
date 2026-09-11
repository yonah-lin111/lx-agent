import type { UsageQuery } from "@shared/contracts/usage"
import { USAGE_CHANNELS } from "@shared/ipc/usageChannels"
import { ipcMain, type WebContents } from "electron"
import { setUsageLogRecordedListener } from "@/agent/usageRecorder"
import { usageLogService } from "@/services/usageLogService"

// 读取查询中的可选字符串维度（空串与超长值忽略）。
const readOptionalString = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error("INVALID_USAGE_QUERY")
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed.length > 200) throw new Error("INVALID_USAGE_QUERY")
  return trimmed
}

// 读取查询中的可选时间戳（毫秒）。
const readOptionalTimestamp = (input: Record<string, unknown>, key: string): number | undefined => {
  const value = input[key]
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("INVALID_USAGE_QUERY")
  }
  return value
}

// 校验并解析统计查询条件。
const parseUsageQuery = (input: unknown): UsageQuery => {
  if (input === undefined || input === null) return {}
  if (typeof input !== "object") throw new Error("INVALID_USAGE_QUERY")

  const record = input as Record<string, unknown>
  return {
    startTime: readOptionalTimestamp(record, "startTime"),
    endTime: readOptionalTimestamp(record, "endTime"),
    provider: readOptionalString(record, "provider"),
    model: readOptionalString(record, "model"),
    projectId: readOptionalString(record, "projectId"),
  }
}

// 校验分页参数并收敛到合法区间。
const parsePageNumber = (input: unknown, fallback: number, max: number): number => {
  if (input === undefined) return fallback
  if (typeof input !== "number" || !Number.isFinite(input) || input < 1) {
    throw new Error("INVALID_USAGE_QUERY")
  }
  return Math.min(max, Math.floor(input))
}

/**
 * 注册 usage 统计查询 IPC 处理器，并把日志写入事件推送到目标窗口。
 */
export const registerUsageHandlers = (getWebContents: () => WebContents | undefined): void => {
  setUsageLogRecordedListener(() => {
    const webContents = getWebContents()
    if (webContents && !webContents.isDestroyed()) {
      webContents.send(USAGE_CHANNELS.event, { type: "logRecorded" })
    }
  })

  ipcMain.handle(USAGE_CHANNELS.listLogs, (_, query: unknown, page: unknown, pageSize: unknown) =>
    usageLogService.listLogs(
      parseUsageQuery(query),
      parsePageNumber(page, 1, 100_000),
      parsePageNumber(pageSize, 50, 200),
    ),
  )
  ipcMain.handle(USAGE_CHANNELS.getSummary, (_, query: unknown) =>
    usageLogService.getSummary(parseUsageQuery(query)),
  )
  ipcMain.handle(USAGE_CHANNELS.getDaily, (_, query: unknown) =>
    usageLogService.getDaily(parseUsageQuery(query)),
  )
  ipcMain.handle(USAGE_CHANNELS.getModelStats, (_, query: unknown) =>
    usageLogService.getModelStats(parseUsageQuery(query)),
  )
  ipcMain.handle(USAGE_CHANNELS.getProviderStats, (_, query: unknown) =>
    usageLogService.getProviderStats(parseUsageQuery(query)),
  )
  ipcMain.handle(USAGE_CHANNELS.getFilterOptions, (_, query: unknown) =>
    usageLogService.getFilterOptions(parseUsageQuery(query)),
  )
}
