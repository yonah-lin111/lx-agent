import type {
  AgentEvent,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSessionSummary,
  LspInstallResult,
  LspServerStatusItem,
  McpServerStatusItem,
  PermissionResponse,
  QuestionResponse,
  SuggestedQuestionContextMessage,
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
  continue: (): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> =>
    window.api.agent.continue(),
  switchWorktree: (path: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    window.api.agent.switchWorktree(path),
  abort: (): Promise<void> => window.api.agent.abort(),
  restore: (messages: AgentMessage[]): Promise<void> => window.api.agent.restore(messages),
  listSessions: (): Promise<AgentSessionSummary[]> => window.api.agent.listSessions(),
  restoreSession: (sessionId: string): Promise<AgentRestoredSession> =>
    window.api.agent.restoreSession(sessionId),
  renameSession: (sessionId: string, title: string): Promise<void> =>
    window.api.agent.renameSession(sessionId, title),
  deleteSession: (sessionId: string): Promise<void> => window.api.agent.deleteSession(sessionId),
  deleteMessageTurn: (sessionId: string, userMessageTimestamp: number): Promise<void> =>
    window.api.agent.deleteMessageTurn(sessionId, userMessageTimestamp),
  forkSession: (
    sessionId: string,
    userMessageTimestamp?: number,
  ): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> =>
    window.api.agent.forkSession(sessionId, userMessageTimestamp),
  getMcpStatus: (): Promise<McpServerStatusItem[]> => window.api.agent.getMcpStatus(),
  getLspStatus: (): Promise<LspServerStatusItem[]> => window.api.agent.getLspStatus(),
  installLspServers: (): Promise<LspInstallResult> => window.api.agent.installLspServers(),
  suggestedQuestions: (
    messages: SuggestedQuestionContextMessage[],
    excludedQuestions?: string[],
  ): Promise<string[]> => window.api.agent.suggestedQuestions(messages, excludedQuestions),
  permissionRespond: (response: PermissionResponse): Promise<{ ok: boolean }> =>
    window.api.agent.permissionRespond(response),
  questionRespond: (response: QuestionResponse): Promise<{ ok: boolean }> =>
    window.api.agent.questionRespond(response),
  openFileAt: (filePath: string, line: number): Promise<{ ok: boolean }> =>
    window.api.agent.openFileAt(filePath, line),
  onEvent: (handler: (event: AgentEvent) => void): (() => void) =>
    window.api.agent.onEvent(handler),
}
