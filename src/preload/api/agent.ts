import type {
  AgentApi,
  AgentEvent,
  AgentSendContext,
  AgentSendOptions,
  PermissionResponse,
  QuestionResponse,
  SuggestedQuestionContextMessage,
} from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import type { ModelSelection } from "@shared/settings"
import { ipcRenderer } from "electron"

// Agent 领域 preload API：发送/中止/恢复会话 + 会话列表 + 订阅事件流。
export const agentApi: AgentApi["agent"] = {
  send: (
    text: string,
    selection?: ModelSelection,
    context?: AgentSendContext,
    options?: AgentSendOptions,
  ) => ipcRenderer.invoke(AGENT_CHANNELS.send, text, selection, context, options),
  continue: (prompt?: string) => ipcRenderer.invoke(AGENT_CHANNELS.continue, prompt),
  compact: () => ipcRenderer.invoke(AGENT_CHANNELS.compact),
  undoCompaction: () => ipcRenderer.invoke(AGENT_CHANNELS.undoCompaction),
  abort: () => ipcRenderer.invoke(AGENT_CHANNELS.abort),
  switchWorktree: (path: string) => ipcRenderer.invoke(AGENT_CHANNELS.switchWorktree, path),
  switchProject: (projectId: string, path: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.switchProject, projectId, path),
  restore: (messages) => ipcRenderer.invoke(AGENT_CHANNELS.restore, messages),
  listSessions: () => ipcRenderer.invoke(AGENT_CHANNELS.listSessions),
  restoreSession: (sessionId: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.restoreSession, sessionId),
  renameSession: (sessionId: string, title: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.renameSession, sessionId, title),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(AGENT_CHANNELS.deleteSession, sessionId),
  deleteMessageTurn: (sessionId: string, userMessageTimestamp: number) =>
    ipcRenderer.invoke(AGENT_CHANNELS.deleteMessageTurn, sessionId, userMessageTimestamp),
  forkSession: (sessionId: string, userMessageTimestamp?: number) =>
    ipcRenderer.invoke(AGENT_CHANNELS.forkSession, sessionId, userMessageTimestamp),
  getMcpStatus: () => ipcRenderer.invoke(AGENT_CHANNELS.getMcpStatus),
  getLspStatus: () => ipcRenderer.invoke(AGENT_CHANNELS.getLspStatus),
  installLspServers: () => ipcRenderer.invoke(AGENT_CHANNELS.installLspServers),
  listPromptTemplates: (cwd?: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.listPromptTemplates, cwd),
  exportSession: (options) => ipcRenderer.invoke(AGENT_CHANNELS.exportSession, options),
  copySession: (options) => ipcRenderer.invoke(AGENT_CHANNELS.copySession, options),
  suggestedQuestions: (messages: SuggestedQuestionContextMessage[], excludedQuestions?: string[]) =>
    ipcRenderer.invoke(AGENT_CHANNELS.suggestedQuestions, messages, excludedQuestions),
  getDefaultPath: () => ipcRenderer.invoke(AGENT_CHANNELS.getDefaultPath),
  permissionRespond: (response: PermissionResponse) =>
    ipcRenderer.invoke(AGENT_CHANNELS.permissionResponse, response),
  questionRespond: (response: QuestionResponse) =>
    ipcRenderer.invoke(AGENT_CHANNELS.questionResponse, response),
  openFileAt: (filePath: string, line: number) =>
    ipcRenderer.invoke(AGENT_CHANNELS.openFileAt, filePath, line),
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.showItemInFolder, filePath),
  getContextUsage: (selection?: ModelSelection) =>
    ipcRenderer.invoke(AGENT_CHANNELS.getContextUsage, selection),
  listJobs: (sessionId?: string) => ipcRenderer.invoke(AGENT_CHANNELS.listJobs, sessionId),
  killJob: (jobId: string, reason?: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.killJob, jobId, reason),
  removeJob: (jobId: string) => ipcRenderer.invoke(AGENT_CHANNELS.removeJob, jobId),
  clearSettledJobs: (sessionId?: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.clearSettledJobs, sessionId),
  readJobOutput: (jobId: string, wait?: boolean, timeoutMs?: number) =>
    ipcRenderer.invoke(AGENT_CHANNELS.readJobOutput, jobId, wait, timeoutMs),
  getPromptAssembly: (sessionId?: string, cwd?: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.getPromptAssembly, sessionId, cwd),
  onEvent: (handler: (event: AgentEvent) => void) => {
    const listener = (_: unknown, event: AgentEvent): void => handler(event)
    ipcRenderer.on(AGENT_CHANNELS.event, listener)
    return () => {
      ipcRenderer.removeListener(AGENT_CHANNELS.event, listener)
    }
  },
}
