import type {
  OpenClawApi,
  OpenClawSendMessageInput,
  OpenClawSessionEvent,
  OpenClawSessionInfo,
  OpenClawSessionSnapshot,
} from "@shared/contracts/openclaw"
import { OPENCLAW_CHANNELS } from "@shared/ipc/openclawChannels"
import { ipcRenderer } from "electron"

// OpenClaw 运行时领域 Preload API。
export const openclawApi: OpenClawApi["openclaw"] = {
  connect: (instanceId: string) => ipcRenderer.invoke(OPENCLAW_CHANNELS.connect, instanceId),
  disconnect: (instanceId: string) => ipcRenderer.invoke(OPENCLAW_CHANNELS.disconnect, instanceId),
  fetchAgents: (instanceId: string) =>
    ipcRenderer.invoke(OPENCLAW_CHANNELS.fetchAgents, instanceId),
  getSnapshot: (instanceId: string, agentId: string) =>
    ipcRenderer.invoke(
      OPENCLAW_CHANNELS.getSnapshot,
      instanceId,
      agentId,
    ) as Promise<OpenClawSessionSnapshot>,
  listSessions: (instanceId: string, agentId: string) =>
    ipcRenderer.invoke(OPENCLAW_CHANNELS.listSessions, instanceId, agentId) as Promise<
      OpenClawSessionInfo[]
    >,
  createSession: (instanceId: string, agentId: string) =>
    ipcRenderer.invoke(
      OPENCLAW_CHANNELS.createSession,
      instanceId,
      agentId,
    ) as Promise<OpenClawSessionInfo>,
  bindSession: (instanceId: string, agentId: string, sessionKey: string) =>
    ipcRenderer.invoke(OPENCLAW_CHANNELS.bindSession, instanceId, agentId, sessionKey),
  sendMessage: (input: OpenClawSendMessageInput) =>
    ipcRenderer.invoke(OPENCLAW_CHANNELS.sendMessage, input),
  abort: (instanceId: string, agentId: string) =>
    ipcRenderer.invoke(OPENCLAW_CHANNELS.abort, instanceId, agentId),
  onEvent: (handler: (event: OpenClawSessionEvent) => void) => {
    const listener = (_: unknown, event: OpenClawSessionEvent): void => handler(event)
    ipcRenderer.on(OPENCLAW_CHANNELS.event, listener)
    return () => {
      ipcRenderer.removeListener(OPENCLAW_CHANNELS.event, listener)
    }
  },
}
