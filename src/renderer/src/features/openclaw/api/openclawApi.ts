import type {
  OpenClawConnectResult,
  OpenClawSendMessageInput,
  OpenClawSessionEvent,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import type { OpenClawAgentItem } from "@shared/settings"

// OpenClaw feature 的 preload API 访问入口。
export const openclawApi = {
  connect: (instanceId: string): Promise<OpenClawConnectResult> =>
    window.api.openclaw.connect(instanceId),
  disconnect: (instanceId: string): Promise<void> => window.api.openclaw.disconnect(instanceId),
  fetchAgents: (
    instanceId: string,
  ): Promise<OpenClawConnectResult & { agents: OpenClawAgentItem[] }> =>
    window.api.openclaw.fetchAgents(instanceId),
  getSnapshot: (instanceId: string, agentId: string): Promise<OpenClawSessionSnapshot> =>
    window.api.openclaw.getSnapshot(instanceId, agentId),
  sendMessage: (input: OpenClawSendMessageInput): Promise<void> =>
    window.api.openclaw.sendMessage(input),
  abort: (instanceId: string, agentId: string): Promise<void> =>
    window.api.openclaw.abort(instanceId, agentId),
  clearMessages: (instanceId: string, agentId: string): Promise<void> =>
    window.api.openclaw.clearMessages(instanceId, agentId),
  resetSession: (instanceId: string, agentId: string): Promise<void> =>
    window.api.openclaw.resetSession(instanceId, agentId),
  onEvent: (handler: (event: OpenClawSessionEvent) => void): (() => void) =>
    window.api.openclaw.onEvent(handler),
}
