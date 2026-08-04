import type { AgentMessage } from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import type { ModelSelection } from "@shared/settings"
import { ipcMain, type WebContents } from "electron"
import { agentRunner } from "@/agent/agentRunner"

// 校验消息数组为合法 AgentMessage（IPC 输入边界）。
const isValidAgentMessage = (value: unknown): value is AgentMessage => {
  if (!value || typeof value !== "object" || !("role" in value)) return false
  const role = (value as { role: unknown }).role
  return role === "user" || role === "assistant" || role === "toolResult"
}

// 校验模型选择为合法 ModelSelection（IPC 输入边界）。
const isValidModelSelection = (value: unknown): value is ModelSelection => {
  if (!value || typeof value !== "object") return false
  const selection = value as Record<string, unknown>
  return (
    typeof selection.provider === "string" &&
    selection.provider.length > 0 &&
    typeof selection.model === "string" &&
    selection.model.length > 0
  )
}

/**
 * 注册 Agent 对话 IPC 处理器，并把 Agent 事件推送到目标窗口。
 */
export const registerAgentHandlers = (getWebContents: () => WebContents | undefined): void => {
  const sendToRenderer = (event: unknown): void => {
    const webContents = getWebContents()
    if (webContents && !webContents.isDestroyed()) {
      webContents.send(AGENT_CHANNELS.event, event)
    }
  }

  agentRunner.attachEventSink(sendToRenderer)

  ipcMain.handle(AGENT_CHANNELS.send, async (_, text: unknown, selection: unknown) => {
    if (typeof text !== "string" || !text.trim()) {
      return { ok: false, error: "消息内容不能为空。" }
    }
    if (selection !== undefined && !isValidModelSelection(selection)) {
      return { ok: false, error: "模型选择参数无效。" }
    }
    return agentRunner.send(text.trim(), selection)
  })

  ipcMain.handle(AGENT_CHANNELS.abort, () => {
    agentRunner.abort()
  })

  ipcMain.handle(AGENT_CHANNELS.restore, (_, messages: unknown) => {
    if (!Array.isArray(messages) || !messages.every(isValidAgentMessage)) {
      throw new Error("INVALID_AGENT_RESTORE_MESSAGES")
    }
    agentRunner.restoreMessages(messages)
  })
}
