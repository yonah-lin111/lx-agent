import type { GameApi } from "@shared/contracts/game"
import { GAME_CHANNELS } from "@shared/ipc/gameChannels"
import { ipcRenderer } from "electron"

export const gameApi: GameApi["game"] = {
  list: () => ipcRenderer.invoke(GAME_CHANNELS.list),
  importFromDialog: () => ipcRenderer.invoke(GAME_CHANNELS.importFromDialog),
  rename: (id, title) => ipcRenderer.invoke(GAME_CHANNELS.rename, id, title),
  remove: (id) => ipcRenderer.invoke(GAME_CHANNELS.remove, id),
  markPlayed: (id) => ipcRenderer.invoke(GAME_CHANNELS.markPlayed, id),
  saveKeymap: (id, keymap) => ipcRenderer.invoke(GAME_CHANNELS.saveKeymap, id, keymap),
  writeSave: (id, data) => ipcRenderer.invoke(GAME_CHANNELS.writeSave, id, data),
  writeState: (id, slot, data) => ipcRenderer.invoke(GAME_CHANNELS.writeState, id, slot, data),
  getRuntimeConfig: () => ipcRenderer.invoke(GAME_CHANNELS.getRuntimeConfig),
}
