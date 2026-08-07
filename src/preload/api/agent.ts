import type { AgentApi, AgentEvent, AgentSendContext } from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import type { ModelSelection } from "@shared/settings"
import { ipcRenderer } from "electron"

// Agent 领域 preload API：发送/中止/恢复会话 + 会话列表 + 订阅事件流。
export const agentApi: AgentApi["agent"] = {
  send: (text: string, selection?: ModelSelection, context?: AgentSendContext) =>
    ipcRenderer.invoke(AGENT_CHANNELS.send, text, selection, context),
  abort: () => ipcRenderer.invoke(AGENT_CHANNELS.abort),
  restore: (messages) => ipcRenderer.invoke(AGENT_CHANNELS.restore, messages),
  listSessions: () => ipcRenderer.invoke(AGENT_CHANNELS.listSessions),
  restoreSession: (sessionId: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.restoreSession, sessionId),
  renameSession: (sessionId: string, title: string) =>
    ipcRenderer.invoke(AGENT_CHANNELS.renameSession, sessionId, title),
  deleteSession: (sessionId: string) => ipcRenderer.invoke(AGENT_CHANNELS.deleteSession, sessionId),
  deleteMessageTurn: (sessionId: string, userMessageTimestamp: number) =>
    ipcRenderer.invoke(AGENT_CHANNELS.deleteMessageTurn, sessionId, userMessageTimestamp),
  getMcpStatus: () => ipcRenderer.invoke(AGENT_CHANNELS.getMcpStatus),
  onEvent: (handler: (event: AgentEvent) => void) => {
    const listener = (_: unknown, event: AgentEvent): void => handler(event)
    ipcRenderer.on(AGENT_CHANNELS.event, listener)
    return () => {
      ipcRenderer.removeListener(AGENT_CHANNELS.event, listener)
    }
  },
}
