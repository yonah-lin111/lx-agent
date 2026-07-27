// 项目领域 IPC channel。
export const PROJECT_CHANNELS = {
  listProjects: "project:projects:list",
  createProject: "project:projects:create",
  updateProject: "project:projects:update",
  deleteProject: "project:projects:delete",
  selectProjectDirectory: "project:projects:select-directory",
  searchProjectFiles: "project:files:search",
  listModules: "project:modules:list",
  createModule: "project:modules:create",
  updateModule: "project:modules:update",
  deleteModule: "project:modules:delete",
  listDesigns: "project:designs:list",
  createDesign: "project:designs:create",
  updateDesign: "project:designs:update",
  sortDesigns: "project:designs:sort",
  deleteDesign: "project:designs:delete",
} as const
