import { create } from "zustand"

// 项目条目数据变更版本号：编辑器自动同步条目状态后递增，通知侧边栏重新加载。
interface ProjectItemsVersionState {
  version: number
  bump: () => void
}

export const useProjectItemsVersionStore = create<ProjectItemsVersionState>((set) => ({
  version: 0,
  bump: () => set((state) => ({ version: state.version + 1 })),
}))
