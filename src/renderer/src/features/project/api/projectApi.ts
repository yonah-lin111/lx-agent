import type { Design, UpdateDesignInput } from "@shared/project"

/**
 * 隔离设计编辑器对 Electron preload API 的依赖。
 */
export const projectApi = {
  list: (): Promise<Design[]> => window.api.project.designs.list(),
  update: (id: string, input: UpdateDesignInput): Promise<void> =>
    window.api.project.designs.update(id, input),
  searchFiles: (projectId: string, query: string) =>
    window.api.project.projects.searchFiles(projectId, query),
}
