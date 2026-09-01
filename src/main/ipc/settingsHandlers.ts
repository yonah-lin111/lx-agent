import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { FetchModelsInput } from "@shared/settings"
import { ipcMain } from "electron"
import { invalidateModelCache } from "@/agent/stream/modelFactory"
import { fetchProviderModels } from "@/services/modelFetchService"
import { getCliVersions, runCliLifecycleAction } from "@/services/cliToolService"
import {
  getCliSettings,
  getModelProviderSettings,
  getPermissionSettings,
  getUiSettings,
  saveCliSettings,
  saveModelProviderSettings,
  savePermissionSettings,
  saveUiSettings,
} from "@/services/settingsService"

/**
 * 注册模型 Provider 设置、Agent 权限设置与 CLI 设置的 IPC 处理器。
 */
export const registerSettingsHandlers = (): void => {
  ipcMain.handle(SETTINGS_CHANNELS.getModelProviders, () => getModelProviderSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveModelProviders, (_, input) => {
    const settings = saveModelProviderSettings(input)
    invalidateModelCache()
    return settings
  })
  ipcMain.handle(SETTINGS_CHANNELS.fetchModels, (_, input: FetchModelsInput) =>
    fetchProviderModels(input.baseURL, input.apiKey),
  )
  ipcMain.handle(SETTINGS_CHANNELS.getPermissionSettings, () => getPermissionSettings())
  ipcMain.handle(SETTINGS_CHANNELS.savePermissionSettings, (_, input) =>
    savePermissionSettings(input),
  )
  ipcMain.handle(SETTINGS_CHANNELS.getUiSettings, () => getUiSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveUiSettings, (_, input) => saveUiSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.getCliSettings, () => getCliSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveCliSettings, (_, input) => saveCliSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.getCliVersions, (_, options) => getCliVersions(options))
  ipcMain.handle(SETTINGS_CHANNELS.runCliLifecycleAction, (_, cliId, action) =>
    runCliLifecycleAction(cliId, action),
  )
}

