import type { PromptHistoryApi } from "@shared/contracts/promptHistory"
import { PROMPT_HISTORY_CHANNELS } from "@shared/ipc/promptHistoryChannels"
import { ipcRenderer } from "electron"

// 提示词历史领域 preload API：读取/追加全局历史提示词。
export const promptHistoryApi: PromptHistoryApi["promptHistory"] = {
  get: () => ipcRenderer.invoke(PROMPT_HISTORY_CHANNELS.get),
  add: (text: string) => ipcRenderer.invoke(PROMPT_HISTORY_CHANNELS.add, text),
}
