import { create } from "zustand"

export type BottomSideBarViewMode = "terminal" | "jobs" | "openclaw"

interface BottomSideBarState {
  isExpanded: boolean
  isCoveringRightSideBar: boolean
  viewMode: BottomSideBarViewMode
  selectedJobId: string | null
  // OpenClaw 视图当前选中的实例与 Agent。
  openClawInstanceId: string | null
  openClawAgentId: string | null
  setExpanded: (expanded: boolean) => void
  setCoveringRightSideBar: (covering: boolean) => void
  setViewMode: (mode: BottomSideBarViewMode) => void
  openJobsMonitor: (jobId?: string) => void
  openOpenClaw: (instanceId?: string, agentId?: string) => void
  setOpenClawTarget: (instanceId: string, agentId: string) => void
}

/**
 * 底边栏状态 Store：管控展开/折叠、右侧栏覆盖、控制台/后台长任务/OpenClaw 视图模式切换。
 */
export const useBottomSideBarStore = create<BottomSideBarState>((set) => ({
  isExpanded: false,
  isCoveringRightSideBar: false,
  viewMode: "terminal",
  selectedJobId: null,
  openClawInstanceId: null,
  openClawAgentId: null,
  setExpanded: (isExpanded) => set({ isExpanded }),
  setCoveringRightSideBar: (isCoveringRightSideBar) => set({ isCoveringRightSideBar }),
  setViewMode: (viewMode) => set({ viewMode }),
  openJobsMonitor: (jobId?: string) =>
    set({
      isExpanded: true,
      viewMode: "jobs",
      selectedJobId: jobId ?? null,
    }),
  openOpenClaw: (instanceId?: string, agentId?: string) =>
    set((state) => ({
      isExpanded: true,
      viewMode: "openclaw",
      openClawInstanceId: instanceId ?? state.openClawInstanceId,
      openClawAgentId: agentId ?? state.openClawAgentId,
    })),
  setOpenClawTarget: (openClawInstanceId, openClawAgentId) =>
    set({ openClawInstanceId, openClawAgentId }),
}))
