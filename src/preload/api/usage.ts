import type { UsageApi, UsageQuery } from "@shared/contracts/usage"
import { USAGE_CHANNELS } from "@shared/ipc/usageChannels"
import { ipcRenderer } from "electron"

// Token 使用统计 preload API：查询聚合数据 + 订阅日志写入事件。
export const usageApi: UsageApi["usage"] = {
  listLogs: (query: UsageQuery, page?: number, pageSize?: number) =>
    ipcRenderer.invoke(USAGE_CHANNELS.listLogs, query, page, pageSize),
  getSummary: (query: UsageQuery) => ipcRenderer.invoke(USAGE_CHANNELS.getSummary, query),
  getDaily: (query: UsageQuery) => ipcRenderer.invoke(USAGE_CHANNELS.getDaily, query),
  getModelStats: (query: UsageQuery) => ipcRenderer.invoke(USAGE_CHANNELS.getModelStats, query),
  getProviderStats: (query: UsageQuery) =>
    ipcRenderer.invoke(USAGE_CHANNELS.getProviderStats, query),
  getFilterOptions: (query: UsageQuery) =>
    ipcRenderer.invoke(USAGE_CHANNELS.getFilterOptions, query),
  onLogRecorded: (handler: () => void) => {
    const listener = (): void => handler()
    ipcRenderer.on(USAGE_CHANNELS.event, listener)
    return () => {
      ipcRenderer.removeListener(USAGE_CHANNELS.event, listener)
    }
  },
}
