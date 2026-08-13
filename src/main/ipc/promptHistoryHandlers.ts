import { PROMPT_HISTORY_CHANNELS } from "@shared/ipc/promptHistoryChannels"
import { ipcMain } from "electron"
import { addPromptHistory, getPromptHistory } from "@/services/promptHistoryService"

/**
 * 注册提示词历史 IPC 处理器（全局共享 JSON 文件）。
 */
export const registerPromptHistoryHandlers = (): void => {
  ipcMain.handle(PROMPT_HISTORY_CHANNELS.get, () => getPromptHistory())
  ipcMain.handle(PROMPT_HISTORY_CHANNELS.add, (_event, text: unknown) => {
    if (typeof text !== "string") return []
    return addPromptHistory(text)
  })
}
