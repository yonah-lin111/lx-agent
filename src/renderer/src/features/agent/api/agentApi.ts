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
  AgentSwitchProjectResult,
  AgentSwitchWorktreeResult,
  AgentUndoCompactionResult,
  CollaborationMode,
  CopySessionOptions,
  CopySessionResult,
  ExportSessionOptions,
  ExportSessionResult,
  LspInstallResult,
  LspServerStatusItem,
  McpServerStatusItem,
  ModelSwitchMessage,
  PermissionResponse,
  PromptAssembly,
  PromptTemplateItem,
  QuestionResponse,
  SkillItem,
  SuggestedQuestionContextMessage,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"

// Agent feature 对 preload API 的访问层。
export const agentApi = {
  getPromptAssembly: (sessionId?: string, cwd?: string, tabId?: string): Promise<PromptAssembly> =>
    window?.api?.agent?.getPromptAssembly
      ? window.api.agent.getPromptAssembly(sessionId, cwd, tabId)
      : Promise.resolve({ sections: [], contexts: [], variables: {}, rendered: "" }),
  compileTailwind: (html: string): Promise<string> =>
    window?.api?.agent?.compileTailwind
      ? window.api.agent.compileTailwind(html)
      : Promise.resolve(""),
  send: (
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
    options?: AgentSendOptions,
  ): Promise<AgentSendResult> => window.api.agent.send(text, selection, context, options),
  continue: (prompt?: string, sessionId?: string, tabId?: string): Promise<AgentSendResult> =>
    window.api.agent.continue(prompt, sessionId, tabId),
  compact: (sessionId?: string, tabId?: string): Promise<AgentCompactResult> =>
    window.api.agent.compact(sessionId, tabId),
  undoCompaction: (sessionId?: string, tabId?: string): Promise<AgentUndoCompactionResult> =>
    window.api.agent.undoCompaction(sessionId, tabId),
  switchWorktree: (
    path: string,
    sessionId?: string,
    tabId?: string,
  ): Promise<AgentSwitchWorktreeResult> => window.api.agent.switchWorktree(path, sessionId, tabId),
  switchProject: (
    projectId: string,
    path: string,
    sessionId?: string,
    tabId?: string,
  ): Promise<AgentSwitchProjectResult> =>
    window.api.agent.switchProject(projectId, path, sessionId, tabId),
  switchModel: (
    selection: ModelSelection,
    sessionId?: string,
    tabId?: string,
  ): Promise<{ ok: true; message?: ModelSwitchMessage } | { ok: false; error: string }> =>
    window.api.agent.switchModel(selection, sessionId, tabId),
  setCollaborationMode: (
    mode: CollaborationMode,
    sessionId?: string,
    tabId?: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> =>
    window.api.agent.setCollaborationMode(mode, sessionId, tabId),
  abort: (sessionId?: string, tabId?: string): Promise<void> =>
    window.api.agent.abort(sessionId, tabId),
  restore: (messages: AgentMessage[], sessionId?: string, tabId?: string): Promise<void> =>
    window.api.agent.restore(messages, sessionId, tabId),
  listSessions: (): Promise<AgentSessionSummary[]> => window.api.agent.listSessions(),
  restoreSession: (sessionId: string, tabId?: string): Promise<AgentRestoredSession> =>
    window.api.agent.restoreSession(sessionId, tabId),
  renameSession: (sessionId: string, title: string): Promise<void> =>
    window.api.agent.renameSession(sessionId, title),
  deleteSession: (sessionId: string): Promise<void> => window.api.agent.deleteSession(sessionId),
  deleteMessageTurn: (sessionId: string, userMessageTimestamp: number): Promise<void> =>
    window.api.agent.deleteMessageTurn(sessionId, userMessageTimestamp),
  forkSession: (sessionId: string, userMessageTimestamp?: number): Promise<AgentForkResult> =>
    window.api.agent.forkSession(sessionId, userMessageTimestamp),
  getMcpStatus: (): Promise<McpServerStatusItem[]> =>
    window?.api?.agent?.getMcpStatus ? window.api.agent.getMcpStatus() : Promise.resolve([]),
  getLspStatus: (): Promise<LspServerStatusItem[]> =>
    window?.api?.agent?.getLspStatus ? window.api.agent.getLspStatus() : Promise.resolve([]),
  installLspServers: (): Promise<LspInstallResult> =>
    window?.api?.agent?.installLspServers
      ? window.api.agent.installLspServers()
      : Promise.resolve({ installed: [], failed: [] }),
  listPromptTemplates: (cwd?: string): Promise<PromptTemplateItem[]> =>
    window?.api?.agent?.listPromptTemplates
      ? window.api.agent.listPromptTemplates(cwd)
      : Promise.resolve([]),
  listSkills: (cwd?: string): Promise<SkillItem[]> =>
    window?.api?.agent?.listSkills ? window.api.agent.listSkills(cwd) : Promise.resolve([]),
  getSkillContent: (name: string, cwd?: string): Promise<string | null> =>
    window?.api?.agent?.getSkillContent
      ? window.api.agent.getSkillContent(name, cwd)
      : Promise.resolve(null),
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
  showItemInFolder: (filePath: string): Promise<{ ok: boolean }> =>
    window.api.agent.showItemInFolder(filePath),
  getContextUsage: (
    selection?: ModelSelection,
    sessionId?: string,
    tabId?: string,
  ): Promise<AgentContextUsage> => window.api.agent.getContextUsage(selection, sessionId, tabId),
  listJobs: (sessionId?: string) => window.api.agent.listJobs(sessionId),
  killJob: (jobId: string, reason?: string) => window.api.agent.killJob(jobId, reason),
  removeJob: (jobId: string) => window.api.agent.removeJob(jobId),
  clearSettledJobs: (sessionId?: string) => window.api.agent.clearSettledJobs(sessionId),
  readJobOutput: (jobId: string, wait?: boolean, timeoutMs?: number) =>
    window.api.agent.readJobOutput(jobId, wait, timeoutMs),
  onEvent: (handler: (event: AgentEvent) => void): (() => void) =>
    window?.api?.agent?.onEvent ? window.api.agent.onEvent(handler) : () => {},
}
