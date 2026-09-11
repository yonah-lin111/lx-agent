import { create } from "zustand"

// OpenClaw 页面视图模式：对话模式（消息流）与工作区模式（像素办公室）。
export type OpenClawViewMode = "conversation" | "workspace"

// 跨页面派发请求：主 Agent 输入框 @claw 委派时写入，OpenClaw 页面消费后执行。
export interface OpenClawPendingDispatch {
  instanceId: string
  agentId: string
  task: string
}

interface OpenClawWorkspaceState {
  viewMode: OpenClawViewMode
  // 当前办公区（= 一个 OpenClaw 实例）。
  selectedInstanceId: string | null
  // 当前办公区中被选中的员工，作为消息的扇出目标；多选即扇出。
  selectedAgentIds: string[]
  // 待消费的派发请求（内存态，不持久化）。
  pendingDispatch: OpenClawPendingDispatch | null
  setViewMode: (mode: OpenClawViewMode) => void
  toggleViewMode: () => void
  selectOffice: (instanceId: string | null, agentId?: string) => void
  selectAgent: (agentId: string, options?: { additive?: boolean }) => void
  setSelectedAgentIds: (agentIds: string[]) => void
  requestDispatch: (dispatch: OpenClawPendingDispatch) => void
  consumePendingDispatch: () => OpenClawPendingDispatch | null
}

/**
 * OpenClaw 工作区状态 Store：办公区选择、视图模式与员工选中集合（仅内存，不落配置）。
 */
export const useOpenClawWorkspaceStore = create<OpenClawWorkspaceState>((set, get) => ({
  viewMode: "conversation",
  selectedInstanceId: null,
  selectedAgentIds: [],
  pendingDispatch: null,
  setViewMode: (viewMode) => set({ viewMode }),
  toggleViewMode: () =>
    set((state) => ({
      viewMode: state.viewMode === "conversation" ? "workspace" : "conversation",
    })),
  selectOffice: (instanceId, agentId) =>
    set({
      selectedInstanceId: instanceId,
      selectedAgentIds: agentId ? [agentId] : [],
    }),
  selectAgent: (agentId, options) =>
    set((state) => {
      if (!options?.additive) return { selectedAgentIds: [agentId] }
      const isSelected = state.selectedAgentIds.includes(agentId)
      return {
        selectedAgentIds: isSelected
          ? state.selectedAgentIds.filter((id) => id !== agentId)
          : [...state.selectedAgentIds, agentId],
      }
    }),
  setSelectedAgentIds: (selectedAgentIds) => set({ selectedAgentIds }),
  requestDispatch: (pendingDispatch) => set({ pendingDispatch }),
  consumePendingDispatch: () => {
    const dispatch = get().pendingDispatch
    if (dispatch) set({ pendingDispatch: null })
    return dispatch
  },
}))
