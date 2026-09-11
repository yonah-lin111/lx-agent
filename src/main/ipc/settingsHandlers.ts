import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { FetchModelsInput } from "@shared/settings"
import { ipcMain } from "electron"
import { lspManager } from "@/agent/lsp/lspManager"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { invalidateModelCache } from "@/agent/stream/modelFactory"
import { BUILT_IN_AGENT_ROLES } from "@/agent/subagent/agentRoles"
import { getCliVersions, runCliLifecycleAction } from "@/services/cliToolService"
import { fetchProviderModels } from "@/services/modelFetchService"
import {
  deleteSkill,
  getCliSettings,
  getHookSettings,
  getLspSettings,
  getMcpSettings,
  getModelProviderSettings,
  getOpenClawSettings,
  getPermissionSettings,
  getSkillSettings,
  getSubagentSettings,
  getUiSettings,
  getVoiceSettings,
  saveCliSettings,
  saveHookSettings,
  saveLspSettings,
  saveMcpSettings,
  saveModelProviderSettings,
  saveOpenClawSettings,
  savePermissionSettings,
  saveSkillSettings,
  saveSubagentSettings,
  saveUiSettings,
  saveVoiceSettings,
} from "@/services/settingsService"
import { transcribeAudioWithGroq } from "@/services/voiceService"

/**
 * 注册模型 Provider 设置、Agent 权限设置、CLI 设置、LSP 设置、MCP 设置与 Skill 设置的 IPC 处理器。
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
  ipcMain.handle(SETTINGS_CHANNELS.getHookSettings, () => getHookSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveHookSettings, (_, input) => saveHookSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.getSubagentSettings, () => getSubagentSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveSubagentSettings, (_, input) => saveSubagentSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.getSubagentBuiltins, () =>
    Object.values(BUILT_IN_AGENT_ROLES).map((role) => ({
      name: role.name,
      description: role.description,
      ...(role.tools ? { tools: [...role.tools] } : {}),
    })),
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
  ipcMain.handle(SETTINGS_CHANNELS.getSkillSettings, () => getSkillSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveSkillSettings, (_, input) => saveSkillSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.deleteSkill, (_, filePath: string) => deleteSkill(filePath))
  ipcMain.handle(SETTINGS_CHANNELS.getVoiceSettings, () => getVoiceSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveVoiceSettings, (_, input) => saveVoiceSettings(input))
  ipcMain.handle(SETTINGS_CHANNELS.transcribeAudio, (_, input) => transcribeAudioWithGroq(input))
  ipcMain.handle(SETTINGS_CHANNELS.getOpenClawSettings, () => getOpenClawSettings())
  ipcMain.handle(SETTINGS_CHANNELS.saveOpenClawSettings, (_, input) => saveOpenClawSettings(input))
}
