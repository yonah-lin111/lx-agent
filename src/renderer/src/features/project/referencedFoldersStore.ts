import type { ReferencedFolder } from "@shared/project"
import { create } from "zustand"

// 项目共享文件夹引用状态。
interface ProjectReferencedFoldersState {
  foldersByProjectId: Record<string, ReferencedFolder[]>
  setReferencedFolders: (projectId: string, folders: ReferencedFolder[]) => void
}

export const useProjectReferencedFoldersStore = create<ProjectReferencedFoldersState>((set) => ({
  foldersByProjectId: {},
  setReferencedFolders: (projectId, folders) =>
    set((state) => ({
      foldersByProjectId: { ...state.foldersByProjectId, [projectId]: folders },
    })),
}))
