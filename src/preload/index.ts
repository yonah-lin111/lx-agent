import { PROJECT_CHANNELS } from "@shared/ipc/projectChannels"
import type { ProjectApi } from "@shared/project"
import { contextBridge, ipcRenderer } from "electron"

const api: ProjectApi = {
  project: {
    projects: {
      list: () => ipcRenderer.invoke(PROJECT_CHANNELS.listProjects),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createProject, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateProject, id, input),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteProject, id),
    },
    modules: {
      list: (projectId?: string) => ipcRenderer.invoke(PROJECT_CHANNELS.listModules, projectId),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createModule, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateModule, id, input),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteModule, id),
    },
    designs: {
      list: (projectId?: string) => ipcRenderer.invoke(PROJECT_CHANNELS.listDesigns, projectId),
      create: (input: unknown) => ipcRenderer.invoke(PROJECT_CHANNELS.createDesign, input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke(PROJECT_CHANNELS.updateDesign, id, input),
      sort: (ids: string[]) => ipcRenderer.invoke(PROJECT_CHANNELS.sortDesigns, ids),
      delete: (id: string) => ipcRenderer.invoke(PROJECT_CHANNELS.deleteDesign, id),
    },
  },
}

contextBridge.exposeInMainWorld("api", api)
