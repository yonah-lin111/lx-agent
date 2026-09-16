import type {
  CreateScheduleItemInput,
  ListScheduleItemsInput,
  ReorderScheduleItemsInput,
  ScheduleRangeStatsInput,
  UpdateScheduleItemInput,
} from "@shared/contracts/schedule"
import { SCHEDULE_CHANNELS } from "@shared/ipc/scheduleChannels"
import { ipcMain } from "electron"
import { scheduleService } from "@/services/scheduleService"

// 边界校验：仅接受普通对象输入，字段级校验归 service。
const assertObjectInput = (input: unknown): void => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("INVALID_SCHEDULE_INPUT")
  }
}

/**
 * 注册日程数据的 IPC 处理器。
 */
export const registerScheduleHandlers = (): void => {
  ipcMain.handle(SCHEDULE_CHANNELS.listByDate, (_, input: ListScheduleItemsInput) => {
    assertObjectInput(input)
    return scheduleService.listByDate(input)
  })

  ipcMain.handle(SCHEDULE_CHANNELS.create, (_, input: CreateScheduleItemInput) => {
    assertObjectInput(input)
    return scheduleService.create(input)
  })

  ipcMain.handle(SCHEDULE_CHANNELS.update, (_, input: UpdateScheduleItemInput) => {
    assertObjectInput(input)
    return scheduleService.update(input)
  })

  ipcMain.handle(SCHEDULE_CHANNELS.remove, (_, id: number) => scheduleService.remove(id))

  ipcMain.handle(SCHEDULE_CHANNELS.reorder, (_, input: ReorderScheduleItemsInput) => {
    assertObjectInput(input)
    return scheduleService.reorder(input)
  })

  ipcMain.handle(SCHEDULE_CHANNELS.listRangeStats, (_, input: ScheduleRangeStatsInput) => {
    assertObjectInput(input)
    return scheduleService.listRangeStats(input)
  })
}
