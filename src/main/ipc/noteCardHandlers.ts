import type { CreateNoteCardInput, UpdateNoteCardInput } from "@shared/contracts/noteCard"
import { NOTE_CARD_CHANNELS } from "@shared/ipc/noteCardChannels"
import { ipcMain } from "electron"
import { noteCardService } from "@/services/noteCardService"

// 判断是否为合法的笔记卡片输入对象。
const isCreateInput = (value: unknown): value is CreateNoteCardInput =>
  Boolean(value) &&
  typeof value === "object" &&
  typeof (value as CreateNoteCardInput).title === "string" &&
  typeof (value as CreateNoteCardInput).content === "string"

// 判断是否为合法的笔记卡片更新输入对象。
const isUpdateInput = (value: unknown): value is UpdateNoteCardInput =>
  Boolean(value) && typeof value === "object"

/**
 * 注册笔记卡片数据的 IPC CRUD 处理器。
 */
export const registerNoteCardHandlers = (): void => {
  ipcMain.handle(NOTE_CARD_CHANNELS.list, () => noteCardService.listNoteCards())
  ipcMain.handle(NOTE_CARD_CHANNELS.create, (_event, input: unknown) => {
    if (!isCreateInput(input)) throw new Error("INVALID_NOTE_CARD_INPUT")
    return noteCardService.createNoteCard(input)
  })
  ipcMain.handle(NOTE_CARD_CHANNELS.update, (_event, id: unknown, input: unknown) => {
    if (typeof id !== "string" || !isUpdateInput(input)) {
      throw new Error("INVALID_NOTE_CARD_INPUT")
    }
    return noteCardService.updateNoteCard(id, input)
  })
  ipcMain.handle(NOTE_CARD_CHANNELS.delete, (_event, id: unknown) => {
    if (typeof id !== "string") throw new Error("INVALID_NOTE_CARD_ID")
    noteCardService.deleteNoteCard(id)
  })
}
