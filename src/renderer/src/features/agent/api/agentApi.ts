import type { AgentEvent, AgentMessage } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"

// Agent feature 对 preload API 的访问层。
export const agentApi = {
  send: (
    text: string,
    selection?: ModelSelection,
  ): Promise<{ ok: true } | { ok: false; error: string }> => window.api.agent.send(text, selection),
  abort: (): Promise<void> => window.api.agent.abort(),
  restore: (messages: AgentMessage[]): Promise<void> => window.api.agent.restore(messages),
  onEvent: (handler: (event: AgentEvent) => void): (() => void) =>
    window.api.agent.onEvent(handler),
}
