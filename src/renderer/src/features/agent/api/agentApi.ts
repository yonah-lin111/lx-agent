import type {
  AgentCompactResult,
  AgentContextUsage,
  AgentEvent,
  AgentForkResult,
  AgentMessage,
  AgentRestoredSession,
  AgentSendContext,
  AgentSendOptions,
  AgentSendResult,
  AgentSessionSummary,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  CopySessionOptions,
  CopySessionResult,
  ExportSessionOptions,
  ExportSessionResult,
  LspInstallResult,
  LspServerStatusItem,
  McpServerStatusItem,
  PermissionResponse,
  PromptTemplateItem,
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
    options?: AgentSendOptions,
  ): Promise<AgentSendResult> => window.api.agent.send(text, selection, context, options),
  continue: (): Promise<AgentSendResult> => window.api.agent.continue(),
  compact: (): Promise<AgentCompactResult> => window.api.agent.compact(),
  undoCompaction: (): Promise<AgentUndoCompactionResult> => window.api.agent.undoCompaction(),
  switchWorktree: (path: string): Promise<AgentSwitchWorktreeResult> =>
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
  forkSession: (sessionId: string, userMessageTimestamp?: number): Promise<AgentForkResult> =>
    window.api.agent.forkSession(sessionId, userMessageTimestamp),
  getMcpStatus: (): Promise<McpServerStatusItem[]> => window.api.agent.getMcpStatus(),
  getLspStatus: (): Promise<LspServerStatusItem[]> => window.api.agent.getLspStatus(),
  installLspServers: (): Promise<LspInstallResult> => window.api.agent.installLspServers(),
  listPromptTemplates: (cwd?: string): Promise<PromptTemplateItem[]> =>
    window?.api?.agent?.listPromptTemplates
      ? window.api.agent.listPromptTemplates(cwd)
      : Promise.resolve([]),
  exportSession: (options: ExportSessionOptions): Promise<ExportSessionResult> =>
    window.api.agent.exportSession(options),
  copySession: (options?: CopySessionOptions): Promise<CopySessionResult> =>
    window.api.agent.copySession(options),
  suggestedQuestions: (
    messages: SuggestedQuestionContextMessage[],
    excludedQuestions?: string[],
  ): Promise<string[]> => window.api.agent.suggestedQuestions(messages, excludedQuestions),
  getDefaultPath: (): Promise<string> => window.api.agent.getDefaultPath(),
  permissionRespond: (response: PermissionResponse): Promise<{ ok: boolean }> =>
    window.api.agent.permissionRespond(response),
  questionRespond: (response: QuestionResponse): Promise<{ ok: boolean }> =>
    window.api.agent.questionRespond(response),
  openFileAt: (filePath: string, line: number): Promise<{ ok: boolean }> =>
    window.api.agent.openFileAt(filePath, line),
  getContextUsage: (selection?: ModelSelection): Promise<AgentContextUsage> =>
    window.api.agent.getContextUsage(selection),
  listJobs: (sessionId?: string) => window.api.agent.listJobs(sessionId),
  killJob: (jobId: string, reason?: string) => window.api.agent.killJob(jobId, reason),
  removeJob: (jobId: string) => window.api.agent.removeJob(jobId),
  clearSettledJobs: (sessionId?: string) => window.api.agent.clearSettledJobs(sessionId),
  readJobOutput: (jobId: string, wait?: boolean, timeoutMs?: number) =>
    window.api.agent.readJobOutput(jobId, wait, timeoutMs),
  onEvent: (handler: (event: AgentEvent) => void): (() => void) =>
    window.api.agent.onEvent(handler),
}
