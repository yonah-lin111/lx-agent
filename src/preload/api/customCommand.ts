import type { CustomCommandApi } from "@shared/contracts/customCommand"
import { CUSTOM_COMMAND_CHANNELS } from "@shared/ipc/customCommandChannels"
import { ipcRenderer } from "electron"

export const customCommandApi: CustomCommandApi["customCommand"] = {
  list: (input) => ipcRenderer.invoke(CUSTOM_COMMAND_CHANNELS.list, input),
  save: (input) => ipcRenderer.invoke(CUSTOM_COMMAND_CHANNELS.save, input),
  delete: (input) => ipcRenderer.invoke(CUSTOM_COMMAND_CHANNELS.delete, input),
}
