import type { ClipboardApi } from "@shared/clipboard"
import type { ActivityApi } from "@shared/contracts/activity"
import type { AgentApi } from "@shared/contracts/agent"
import type { CustomCommandApi } from "@shared/contracts/customCommand"
import type { GameApi } from "@shared/contracts/game"
import type { GitApi } from "@shared/contracts/git"
import type { MarkdownApi } from "@shared/contracts/markdown"
import type { NotificationApi } from "@shared/contracts/notification"
import type { OpenClawApi } from "@shared/contracts/openclaw"
import type { PromptHistoryApi } from "@shared/contracts/promptHistory"
import type { ScheduleApi } from "@shared/contracts/schedule"
import type { TerminalApi } from "@shared/contracts/terminal"
import type { UsageApi } from "@shared/contracts/usage"
import { CLIPBOARD_CHANNELS } from "@shared/ipc/clipboardChannels"
import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { ProjectApi } from "@shared/project"
import type { SettingsApi } from "@shared/settings"
import { contextBridge, ipcRenderer, webUtils } from "electron"
import { activityApi } from "./api/activity"
import { agentApi } from "./api/agent"
import { customCommandApi } from "./api/customCommand"
import { gameApi } from "./api/game"
import { gitApi } from "./api/git"
import { markdownApi } from "./api/markdown"
import { notificationApi } from "./api/notification"
import { openclawApi } from "./api/openclaw"
import { promptHistoryApi } from "./api/promptHistory"
import { scheduleApi } from "./api/schedule"
import { terminalApi } from "./api/terminal"
import { usageApi } from "./api/usage"

const api: ProjectApi &
  ClipboardApi &
  SettingsApi &
  AgentApi &
  MarkdownApi &
  CustomCommandApi &
  GitApi &
  PromptHistoryApi &
  TerminalApi &
  ActivityApi &
  UsageApi &
  ScheduleApi &
  OpenClawApi &
  NotificationApi &
  GameApi = {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  saveClipboardImage: (buffer, mimeType) =>
    ipcRenderer.invoke(CLIPBOARD_CHANNELS.saveImage, buffer, mimeType),
  project: {
    projects: {
      list: () => ipcRenderer.invoke(PROJECT_CHANNELS.listProjects),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createProject, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateProject, id, input),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteProject, id),
      selectDirectory: () => ipcRenderer.invoke(PROJECT_CHANNELS.selectProjectDirectory),
      findOrCreateByPath: (path: string) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.findOrCreateByPath, path),
      searchFiles: (projectId: string, query: string) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.searchProjectFiles, projectId, query),
      searchReferencedFiles: (projectPaths: string[], query: string) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.searchReferencedProjectFiles, projectPaths, query),
      searchDirectoryFiles: (directory: string, query: string) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.searchDirectoryFiles, directory, query),
    },
    folders: {
      list: (projectId?: string) => ipcRenderer.invoke(PROJECT_CHANNELS.listFolders, projectId),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createFolder, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateFolder, id, input),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteFolder, id),
    },
    items: {
      list: (projectId?: string) => ipcRenderer.invoke(PROJECT_CHANNELS.listItems, projectId),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createItem, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateItem, id, input),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteItem, id),
    },
  },
  settings: {
    getModelProviders: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getModelProviders),
    saveModelProviders: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveModelProviders, settings),
    fetchModels: (input) => ipcRenderer.invoke(SETTINGS_CHANNELS.fetchModels, input),
    getPermissionSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getPermissionSettings),
    savePermissionSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.savePermissionSettings, settings),
    getHookSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getHookSettings),
    saveHookSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveHookSettings, settings),
    getSubagentSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getSubagentSettings),
    saveSubagentSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveSubagentSettings, settings),
    getSubagentBuiltins: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getSubagentBuiltins),
    getUiSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getUiSettings),
    saveUiSettings: (settings) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveUiSettings, settings),
    getCliSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getCliSettings),
    saveCliSettings: (settings) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveCliSettings, settings),
    getCliVersions: (options) => ipcRenderer.invoke(SETTINGS_CHANNELS.getCliVersions, options),
    runCliLifecycleAction: (cliId, action) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.runCliLifecycleAction, cliId, action),
    getLspSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getLspSettings),
    saveLspSettings: (settings) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveLspSettings, settings),
    getLspStatus: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getLspStatus),
    installLspServer: (packageName) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.installLspServer, packageName),
    getMcpSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getMcpSettings),
    saveMcpSettings: (settings) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveMcpSettings, settings),
    reconnectMcp: () => ipcRenderer.invoke(SETTINGS_CHANNELS.reconnectMcp),
    getMcpPresetStatus: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getMcpPresetStatus),
    installMcpPreset: (id) => ipcRenderer.invoke(SETTINGS_CHANNELS.installMcpPreset, id),
    getSkillSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getSkillSettings),
    saveSkillSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveSkillSettings, settings),
    deleteSkill: (filePath) => ipcRenderer.invoke(SETTINGS_CHANNELS.deleteSkill, filePath),
    getVoiceSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getVoiceSettings),
    saveVoiceSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveVoiceSettings, settings),
    transcribeAudio: (input) => ipcRenderer.invoke(SETTINGS_CHANNELS.transcribeAudio, input),
    getOpenClawSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getOpenClawSettings),
    saveOpenClawSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveOpenClawSettings, settings),
    getTokenSaverSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getTokenSaverSettings),
    saveTokenSaverSettings: (settings) =>
      ipcRenderer.invoke(SETTINGS_CHANNELS.saveTokenSaverSettings, settings),
  },

  agent: agentApi,
  markdown: markdownApi,
  customCommand: customCommandApi,
  git: gitApi,
  activity: activityApi,
  usage: usageApi,
  schedule: scheduleApi,
  promptHistory: promptHistoryApi,
  terminal: terminalApi,
  openclaw: openclawApi,
  notification: notificationApi,
  game: gameApi,
}

contextBridge.exposeInMainWorld("api", api)
