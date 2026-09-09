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

    return overviewService.getStats({ projectId })
  })
}
