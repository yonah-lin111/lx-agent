import type {
  AgentEvent,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSessionFilter,
  AgentSessionSummary,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"

// Agent feature 对 preload API 的访问层。
export const agentApi = {
  send: (
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
  ): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> =>
    window.api.agent.send(text, selection, context),
  abort: (): Promise<void> => window.api.agent.abort(),
  restore: (messages: AgentMessage[]): Promise<void> => window.api.agent.restore(messages),
  listSessions: (filter?: AgentSessionFilter): Promise<AgentSessionSummary[]> =>
    window.api.agent.listSessions(filter),
  restoreSession: (sessionId: string): Promise<AgentRestoredSession> =>
    window.api.agent.restoreSession(sessionId),
  onEvent: (handler: (event: AgentEvent) => void): (() => void) =>
    window.api.agent.onEvent(handler),
}
