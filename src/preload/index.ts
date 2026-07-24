import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("api", {
  project: {
    projects: {
      list: () => ipcRenderer.invoke("project:projects:list"),
      create: (input: unknown) => ipcRenderer.invoke("project:projects:create", input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke("project:projects:update", id, input),
      delete: (id: string) => ipcRenderer.invoke("project:projects:delete", id),
    },
    modules: {
      list: (projectId?: string) => ipcRenderer.invoke("project:modules:list", projectId),
      create: (input: unknown) => ipcRenderer.invoke("project:modules:create", input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke("project:modules:update", id, input),
      delete: (id: string) => ipcRenderer.invoke("project:modules:delete", id),
    },
    designs: {
      list: (projectId?: string) => ipcRenderer.invoke("project:designs:list", projectId),
      create: (input: unknown) => ipcRenderer.invoke("project:designs:create", input),
      update: (id: string, input: unknown) =>
        ipcRenderer.invoke("project:designs:update", id, input),
      sort: (ids: string[]) => ipcRenderer.invoke("project:designs:sort", ids),
      delete: (id: string) => ipcRenderer.invoke("project:designs:delete", id),
    },
  },
})
