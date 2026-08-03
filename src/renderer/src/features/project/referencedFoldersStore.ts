import type { ReferencedFolder } from "@shared/project"
import { create } from "zustand"

// 共享文件夹引用状态：目录按项目共享，启用状态按条目独立。
interface ProjectReferencedFoldersState {
  foldersByProjectId: Record<string, ReferencedFolder[]>
  enabledPathsByItemId: Record<string, string[]>
  setProjectReferencedFolders: (projectId: string, folders: ReferencedFolder[]) => void
  setItemEnabledPaths: (itemId: string, paths: string[]) => void
}

export const useProjectReferencedFoldersStore = create<ProjectReferencedFoldersState>((set) => ({
  foldersByProjectId: {},
  enabledPathsByItemId: {},
  setProjectReferencedFolders: (projectId, folders) =>
    set((state) => ({
      foldersByProjectId: { ...state.foldersByProjectId, [projectId]: folders },
    })),
  setItemEnabledPaths: (itemId, paths) =>
    set((state) => ({
      enabledPathsByItemId: { ...state.enabledPathsByItemId, [itemId]: paths },
    })),
}))
