import { OVERVIEW_CHANNELS } from "@shared/ipc/overviewChannels"
import { ipcMain } from "electron"
import { overviewService } from "@/services/overviewService"

/**
 * 注册概览统计数据的 IPC 查询处理器。
 */
export const registerOverviewHandlers = (): void => {
  ipcMain.handle(OVERVIEW_CHANNELS.getStats, (_, input) => {
    if (input !== undefined && (typeof input !== "object" || input === null)) {
      throw new Error("INVALID_OVERVIEW_INPUT")
    }

    const projectId =
      input && "projectId" in input && typeof input.projectId === "string"
        ? input.projectId
        : undefined

    const metricsProjectId =
      input && "metricsProjectId" in input && typeof input.metricsProjectId === "string"
        ? input.metricsProjectId
        : undefined

    const heatmapProjectId =
      input && "heatmapProjectId" in input && typeof input.heatmapProjectId === "string"
        ? input.heatmapProjectId
        : undefined

    const timeRange =
      input &&
      "timeRange" in input &&
      typeof input.timeRange === "string" &&
      ["today", "7d", "30d", "all"].includes(input.timeRange)
        ? (input.timeRange as "today" | "7d" | "30d" | "all")
        : undefined

    return overviewService.getStats({
      projectId,
      metricsProjectId,
      heatmapProjectId,
      timeRange,
    })
  })
}
