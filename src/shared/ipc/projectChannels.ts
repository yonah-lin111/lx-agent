// 项目领域 IPC channel。
export const PROJECT_CHANNELS = {
  listProjects: "project:projects:list",
  createProject: "project:projects:create",
  updateProject: "project:projects:update",
  deleteProject: "project:projects:delete",
  selectProjectDirectory: "project:projects:select-directory",
  searchProjectFiles: "project:files:search",
  searchReferencedProjectFiles: "project:references:files:search",
  searchDirectoryFiles: "project:directory:files:search",
  listFolders: "project:folders:list",
  createFolder: "project:folders:create",
  updateFolder: "project:folders:update",
  deleteFolder: "project:folders:delete",
  listItems: "project:items:list",
  createItem: "project:items:create",
  updateItem: "project:items:update",
  deleteItem: "project:items:delete",
} as const
