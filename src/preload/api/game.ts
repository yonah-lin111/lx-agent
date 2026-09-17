import type { GameApi } from "@shared/contracts/game"
import { GAME_CHANNELS } from "@shared/ipc/gameChannels"
import { ipcRenderer } from "electron"

export const gameApi: GameApi["game"] = {
  list: () => ipcRenderer.invoke(GAME_CHANNELS.list),
  importFromDialog: () => ipcRenderer.invoke(GAME_CHANNELS.importFromDialog),
  rename: (id, title) => ipcRenderer.invoke(GAME_CHANNELS.rename, id, title),
  remove: (id) => ipcRenderer.invoke(GAME_CHANNELS.remove, id),
  markPlayed: (id) => ipcRenderer.invoke(GAME_CHANNELS.markPlayed, id),
  writeSave: (id, data) => ipcRenderer.invoke(GAME_CHANNELS.writeSave, id, data),
  getRuntimeConfig: () => ipcRenderer.invoke(GAME_CHANNELS.getRuntimeConfig),
}
