import type { UpdateApi, UpdateState } from "@shared/contracts/update"
import { UPDATE_CHANNELS } from "@shared/ipc/updateChannels"
import { ipcRenderer } from "electron"

// 应用更新领域 Preload API：读取状态、手动检查与订阅状态推送。
export const updateApi: UpdateApi["update"] = {
  getState: () => ipcRenderer.invoke(UPDATE_CHANNELS.getState),
  check: () => ipcRenderer.invoke(UPDATE_CHANNELS.check),
  onStateChanged: (handler: (state: UpdateState) => void) => {
    const listener = (_: unknown, state: UpdateState): void => handler(state)
    ipcRenderer.on(UPDATE_CHANNELS.stateChanged, listener)
    return () => {
      ipcRenderer.removeListener(UPDATE_CHANNELS.stateChanged, listener)
    }
  },
}
