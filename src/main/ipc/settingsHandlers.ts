import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import { ipcMain } from "electron"
import { invalidateModelCache } from "@/agent/stream/modelFactory"
import { getModelProviderSettings, saveModelProviderSettings } from "@/services/settingsService"

/**
 * 注册模型 Provider 设置的 IPC 处理器。
 */
export const registerSettingsHandlers = (): void => {
  ipcMain.handle(SETTINGS_CHANNELS.getModelProviders, () => getModelProviderSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveModelProviders, (_, input) => {
    const settings = saveModelProviderSettings(input)
    invalidateModelCache()
    return settings
  })
}
