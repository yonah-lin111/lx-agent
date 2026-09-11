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
  // 当前正在查看其会话的员工。
  activeAgentId: string | null
  // 待消费的派发请求（内存态，不持久化）。
  pendingDispatch: OpenClawPendingDispatch | null
  selectOffice: (instanceId: string | null, agentId?: string) => void
  selectAgent: (agentId: string, options?: { additive?: boolean }) => void
  setSelectedAgentIds: (agentIds: string[]) => void
  requestDispatch: (dispatch: OpenClawPendingDispatch) => void
  consumePendingDispatch: () => OpenClawPendingDispatch | null
}

/**
 * OpenClaw 办公区状态 Store：办公区、员工选中集合与当前查看的员工（仅内存）。
 */
export const useOpenClawOfficeStore = create<OpenClawOfficeState>((set, get) => ({
  selectedInstanceId: null,
  selectedAgentIds: [],
  activeAgentId: null,
  pendingDispatch: null,
  selectOffice: (instanceId, agentId) =>
    set({
      selectedInstanceId: instanceId,
      selectedAgentIds: agentId ? [agentId] : [],
      activeAgentId: agentId ?? null,
    }),
  selectAgent: (agentId, options) =>
    set((state) => {
      if (!options?.additive) return { selectedAgentIds: [agentId], activeAgentId: agentId }
      const isSelected = state.selectedAgentIds.includes(agentId)
      if (isSelected) {
        const next = state.selectedAgentIds.filter((id) => id !== agentId)
        return {
          selectedAgentIds: next,
          activeAgentId: state.activeAgentId === agentId ? (next[0] ?? null) : state.activeAgentId,
        }
      }
      return { selectedAgentIds: [...state.selectedAgentIds, agentId], activeAgentId: agentId }
    }),
  setSelectedAgentIds: (agentIds) =>
    set((state) => ({
      selectedAgentIds: agentIds,
      activeAgentId:
        state.activeAgentId && agentIds.includes(state.activeAgentId)
          ? state.activeAgentId
          : (agentIds[0] ?? null),
    })),
  requestDispatch: (pendingDispatch) => set({ pendingDispatch }),
  consumePendingDispatch: () => {
    const dispatch = get().pendingDispatch
    if (dispatch) set({ pendingDispatch: null })
    return dispatch
  },
}))
