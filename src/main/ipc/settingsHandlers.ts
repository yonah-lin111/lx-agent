import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { FetchModelsInput } from "@shared/settings"
import { ipcMain } from "electron"
import { lspManager } from "@/agent/lsp/lspManager"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { invalidateModelCache } from "@/agent/stream/modelFactory"
import { getCliVersions, runCliLifecycleAction } from "@/services/cliToolService"
import { fetchProviderModels } from "@/services/modelFetchService"
import {
  getCliSettings,
  getLspSettings,
  getMcpSettings,
  getModelProviderSettings,
  getPermissionSettings,
  getUiSettings,
  saveCliSettings,
  saveLspSettings,
  saveMcpSettings,
  saveModelProviderSettings,
  savePermissionSettings,
  saveUiSettings,
} from "@/services/settingsService"

/**
 * 注册模型 Provider 设置、Agent 权限设置、CLI 设置、LSP 设置与 MCP 设置的 IPC 处理器。
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
  ipcMain.handle(SETTINGS_CHANNELS.getLspSettings, () => getLspSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveLspSettings, (_, input) => saveLspSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.getLspStatus, () => lspManager.getDetailedStatus())
  ipcMain.handle(SETTINGS_CHANNELS.installLspServer, (_, packageName: string) =>
    lspManager.installServer(packageName),
  )
  ipcMain.handle(SETTINGS_CHANNELS.getMcpSettings, () => getMcpSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveMcpSettings, async (_, input) => {
    const saved = saveMcpSettings(input)
    await mcpManager.reloadAndReconnect()
    return saved
  })
  ipcMain.handle(SETTINGS_CHANNELS.reconnectMcp, () => mcpManager.reloadAndReconnect())
}
