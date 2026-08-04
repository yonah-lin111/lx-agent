import type { ReferencedFolder } from "@shared/project"
import { create } from "zustand"

// 共享文件夹引用状态：目录按项目共享，启用状态按条目独立。
interface ProjectReferencedFoldersState {
  foldersByProjectId: Record<string, ReferencedFolder[]>
  enabledPathsByItemId: Record<string, string[]>
  setProjectReferencedFolders: (projectId: string, folders: ReferencedFolder[]) => void
  setItemEnabledPaths: (itemId: string, paths: string[]) => void
  // 从全部条目的启用路径中移除指定路径（项目级引用被删除时同步清理）。
  removeEnabledPathFromAllItems: (path: string) => void
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
  removeEnabledPathFromAllItems: (path) =>
    set((state) => ({
      enabledPathsByItemId: Object.fromEntries(
        Object.entries(state.enabledPathsByItemId).map(([itemId, paths]) => [
          itemId,
          paths.filter((itemPath) => itemPath !== path),
        ]),
      ),
    })),
}))
