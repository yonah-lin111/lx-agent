import { create } from "zustand"

// 跨页面派发请求：主 Agent 输入框 @claw 委派时写入，OpenClaw 页面消费后执行。
export interface OpenClawPendingDispatch {
  instanceId: string
  agentId: string
  task: string
}

interface OpenClawOfficeState {
  // 当前办公区（= 一个 OpenClaw 实例）。
  selectedInstanceId: string | null
  // 当前办公区中被选中的员工，作为消息的扇出目标；多选即扇出。
  selectedAgentIds: string[]
  // 待消费的派发请求（内存态，不持久化）。
  pendingDispatch: OpenClawPendingDispatch | null
  selectOffice: (instanceId: string | null, agentId?: string) => void
  selectAgent: (agentId: string, options?: { additive?: boolean }) => void
  setSelectedAgentIds: (agentIds: string[]) => void
  requestDispatch: (dispatch: OpenClawPendingDispatch) => void
  consumePendingDispatch: () => OpenClawPendingDispatch | null
}

/**
 * OpenClaw 办公区状态 Store：办公区与员工选中集合（仅内存，不落配置）。
 */
export const useOpenClawOfficeStore = create<OpenClawOfficeState>((set, get) => ({
  selectedInstanceId: null,
  selectedAgentIds: [],
  pendingDispatch: null,
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
