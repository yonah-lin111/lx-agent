import type {
  AgentEvent,
  AgentMessage,
  AgentSendContext,
  McpServerStatusItem,
  SuggestedQuestionContextMessage,
} from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import type { ModelSelection } from "@shared/settings"
import { ipcMain, type WebContents } from "electron"
import { agentRunner } from "@/agent/agentRunner"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { generateSuggestedQuestions } from "@/agent/suggestedQuestionsGenerator"

// 会话标题长度上限（对齐 createTitle 的 40 字符截断）。
const MAX_TITLE_LENGTH = 40

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

// undefined 或字符串（IPC 可选字段校验）。
const isOptionalString = (value: unknown): value is string =>
  value === undefined || typeof value === "string"

// 校验发送上下文为合法 AgentSendContext（IPC 输入边界）。
const isValidSendContext = (value: unknown): value is AgentSendContext => {
  if (value === undefined) return true
  if (!value || typeof value !== "object") return false
  const context = value as Record<string, unknown>
  return (
    isOptionalString(context.projectItemId) &&
    isOptionalString(context.projectId) &&
    isOptionalString(context.page) &&
    isOptionalString(context.cwd)
  )
}

// 校验建议问题上下文为合法消息数组（IPC 输入边界）。
const isValidSuggestedQuestionContext = (
  value: unknown,
): value is SuggestedQuestionContextMessage[] => {
  if (!Array.isArray(value)) return false
  return value.every((item): item is SuggestedQuestionContextMessage => {
    if (!item || typeof item !== "object") return false
    const message = item as Record<string, unknown>
    return (
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string"
    )
  })
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

  ipcMain.handle(
    AGENT_CHANNELS.send,
    async (_, text: unknown, selection: unknown, context: unknown) => {
      if (typeof text !== "string" || !text.trim()) {
        return { ok: false, error: "消息内容不能为空。" }
      }
      if (selection !== undefined && !isValidModelSelection(selection)) {
        return { ok: false, error: "模型选择参数无效。" }
      }
      if (!isValidSendContext(context)) {
        return { ok: false, error: "会话上下文参数无效。" }
      }
      return agentRunner.send(text.trim(), selection, context)
    },
  )

  ipcMain.handle(AGENT_CHANNELS.abort, () => {
    agentRunner.abort()
  })

  // MCP 连接状态变更推送到渲染层（启动异步连接完成 / 运行中断连等）。
  mcpManager.onStatusChange(() => {
    const servers: McpServerStatusItem[] = mcpManager.getStatus()
    const event: AgentEvent = { type: "mcp_status_changed", servers }
    sendToRenderer(event)
  })

  ipcMain.handle(AGENT_CHANNELS.getMcpStatus, () => mcpManager.getStatus())

  ipcMain.handle(
    AGENT_CHANNELS.suggestedQuestions,
    (_, messages: unknown, excludedQuestions: unknown) => {
      if (!isValidSuggestedQuestionContext(messages)) return []
      const excluded = Array.isArray(excludedQuestions)
        ? excludedQuestions.filter((item): item is string => typeof item === "string")
        : []
      return generateSuggestedQuestions(messages, excluded)
    },
  )

  ipcMain.handle(AGENT_CHANNELS.restore, (_, messages: unknown) => {
    if (!Array.isArray(messages) || !messages.every(isValidAgentMessage)) {
      throw new Error("INVALID_AGENT_RESTORE_MESSAGES")
    }
    agentRunner.restoreMessages(messages)
  })

  ipcMain.handle(AGENT_CHANNELS.listSessions, () => agentRunner.listSessions())

  ipcMain.handle(AGENT_CHANNELS.restoreSession, (_, sessionId: unknown) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("INVALID_SESSION_ID")
    }
    return agentRunner.restoreSession(sessionId)
  })

  ipcMain.handle(AGENT_CHANNELS.renameSession, (_, sessionId: unknown, title: unknown) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("INVALID_SESSION_ID")
    }
    if (typeof title !== "string") {
      throw new Error("INVALID_SESSION_TITLE")
    }
    const trimmed = title.trim()
    if (!trimmed || trimmed.length > MAX_TITLE_LENGTH) {
      throw new Error("INVALID_SESSION_TITLE")
    }
    agentRunner.renameSession(sessionId, trimmed)
  })

  ipcMain.handle(AGENT_CHANNELS.deleteSession, (_, sessionId: unknown) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("INVALID_SESSION_ID")
    }
    agentRunner.deleteSession(sessionId)
  })

  ipcMain.handle(AGENT_CHANNELS.deleteMessageTurn, (_, sessionId: unknown, timestamp: unknown) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("INVALID_SESSION_ID")
    }
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      throw new Error("INVALID_MESSAGE_TIMESTAMP")
    }
    agentRunner.deleteMessageTurn(sessionId, timestamp)
  })
}
