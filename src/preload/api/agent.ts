import type { AgentApi, AgentEvent } from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import type { ModelSelection } from "@shared/settings"
import { ipcRenderer } from "electron"

// Agent 领域 preload API：发送/中止/恢复会话 + 订阅事件流。
export const agentApi: AgentApi["agent"] = {
  send: (text: string, selection?: ModelSelection) =>
    ipcRenderer.invoke(AGENT_CHANNELS.send, text, selection),
  abort: () => ipcRenderer.invoke(AGENT_CHANNELS.abort),
  restore: (messages) => ipcRenderer.invoke(AGENT_CHANNELS.restore, messages),
  onEvent: (handler: (event: AgentEvent) => void) => {
    const listener = (_: unknown, event: AgentEvent): void => handler(event)
    ipcRenderer.on(AGENT_CHANNELS.event, listener)
    return () => {
      ipcRenderer.removeListener(AGENT_CHANNELS.event, listener)
    }
  },
}
