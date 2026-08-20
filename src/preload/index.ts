import type { ClipboardApi } from "@shared/clipboard"
import type { AgentApi } from "@shared/contracts/agent"
import type { GitApi } from "@shared/contracts/git"
import type { MarkdownApi } from "@shared/contracts/markdown"
import type { PromptHistoryApi } from "@shared/contracts/promptHistory"
import type { TerminalApi } from "@shared/contracts/terminal"
import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import { SETTINGS_CHANNELS } from "@shared/ipc/settingsChannels"
import type { ProjectApi } from "@shared/project"
import type { SettingsApi } from "@shared/settings"
import { contextBridge, ipcRenderer, webUtils } from "electron"
import { agentApi } from "./api/agent"
import { gitApi } from "./api/git"
import { markdownApi } from "./api/markdown"
import { promptHistoryApi } from "./api/promptHistory"
import { terminalApi } from "./api/terminal"

const api: ProjectApi &
  ClipboardApi &
  SettingsApi &
  AgentApi &
  MarkdownApi &
  GitApi &
  PromptHistoryApi &
  TerminalApi = {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  project: {
    projects: {
      list: () => ipcRenderer.invoke(PROJECT_CHANNELS.listProjects),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createProject, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateProject, id, input),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteProject, id),
      selectDirectory: () => ipcRenderer.invoke(PROJECT_CHANNELS.selectProjectDirectory),
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
    getUiSettings: () => ipcRenderer.invoke(SETTINGS_CHANNELS.getUiSettings),
    saveUiSettings: (settings) => ipcRenderer.invoke(SETTINGS_CHANNELS.saveUiSettings, settings),
  },
  agent: agentApi,
  markdown: markdownApi,
  git: gitApi,
  promptHistory: promptHistoryApi,
  terminal: terminalApi,
}

contextBridge.exposeInMainWorld("api", api)
