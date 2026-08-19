import { create } from "zustand"

export type BottomSideBarViewMode = "terminal" | "jobs"

interface BottomSideBarState {
  isExpanded: boolean
  isCoveringRightSideBar: boolean
  viewMode: BottomSideBarViewMode
  selectedJobId: string | null
  setExpanded: (expanded: boolean) => void
  setCoveringRightSideBar: (covering: boolean) => void
  setViewMode: (mode: BottomSideBarViewMode) => void
  openJobsMonitor: (jobId?: string) => void
}

/**
 * 底边栏状态 Store：管控展开/折叠、右侧栏覆盖、控制台与后台长任务视图模式切换。
 */
export const useBottomSideBarStore = create<BottomSideBarState>((set) => ({
  isExpanded: false,
  isCoveringRightSideBar: false,
  viewMode: "terminal",
  selectedJobId: null,
  setExpanded: (isExpanded) => set({ isExpanded }),
  setCoveringRightSideBar: (isCoveringRightSideBar) => set({ isCoveringRightSideBar }),
  setViewMode: (viewMode) => set({ viewMode }),
  openJobsMonitor: (jobId?: string) =>
    set({
      isExpanded: true,
      viewMode: "jobs",
      selectedJobId: jobId ?? null,
    }),
}))
