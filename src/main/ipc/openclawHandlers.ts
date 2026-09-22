import type { OpenClawAttachmentFile, OpenClawSendMessageInput } from "@shared/contracts/openclaw"
import { OPENCLAW_CHANNELS } from "@shared/ipc/openclawChannels"
import { ipcMain, type WebContents } from "electron"
import { notificationService } from "@/services/notificationService"
import { openClawClientManager } from "@/services/openclaw/openclawClientManager"

// 校验 IPC 字符串入参（IPC 输入边界）。
const requireString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`INVALID_${field}`)
  }
  return value.trim()
}

// 校验附件入参；文件内容不经过 IPC，仅保留路径与展示元数据。
const parseAttachmentFiles = (value: unknown): OpenClawAttachmentFile[] | undefined => {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error("INVALID_ATTACHMENT_FILES")
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("INVALID_ATTACHMENT_FILE")
    const candidate = item as Partial<OpenClawAttachmentFile>
    const sizeBytes =
      typeof candidate.sizeBytes === "number" && Number.isFinite(candidate.sizeBytes)
        ? candidate.sizeBytes
        : undefined
    return {
      name: requireString(candidate.name, "ATTACHMENT_NAME"),
      path: requireString(candidate.path, "ATTACHMENT_PATH"),
      type: candidate.type === "text" ? "text" : "image",
      ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    }
  })
}

// 校验发送任务入参（IPC 输入边界）。
const parseSendMessageInput = (value: unknown): OpenClawSendMessageInput => {
  if (!value || typeof value !== "object") throw new Error("INVALID_SEND_MESSAGE_INPUT")
  const candidate = value as Partial<OpenClawSendMessageInput>
  const files = parseAttachmentFiles(candidate.files)
  return {
    instanceId: requireString(candidate.instanceId, "INSTANCE_ID"),
    agentId: requireString(candidate.agentId, "AGENT_ID"),
    message: requireString(candidate.message, "MESSAGE"),
    ...(files ? { files } : {}),
  }
}

/**
 * 注册 OpenClaw 运行时领域 IPC 处理器，并把会话事件转发到渲染进程。
 */
export const registerOpenClawHandlers = (resolveSender: () => WebContents | undefined): void => {
  openClawClientManager.setEventSink((event) => {
    const sender = resolveSender()
    if (sender && !sender.isDestroyed()) {
      sender.send(OPENCLAW_CHANNELS.event, event)
    }
  })

  // run 结束信号转交通知服务：窗口未聚焦时投递系统通知。
  openClawClientManager.setRunFinishedListener((connection, session, aborted) => {
    notificationService.handleOpenClawRunFinished({
      instanceId: connection.instanceId,
      agentId: session.agentId,
      aborted,
    })
  })

  ipcMain.handle(OPENCLAW_CHANNELS.connect, (_, instanceId: unknown) =>
    openClawClientManager.connect(requireString(instanceId, "INSTANCE_ID")),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.disconnect, (_, instanceId: unknown) =>
    openClawClientManager.disconnect(requireString(instanceId, "INSTANCE_ID")),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.fetchAgents, (_, instanceId: unknown) =>
    openClawClientManager.fetchAgents(requireString(instanceId, "INSTANCE_ID")),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.getSnapshot, (_, instanceId: unknown, agentId: unknown) =>
    openClawClientManager.getSnapshot(
      requireString(instanceId, "INSTANCE_ID"),
      requireString(agentId, "AGENT_ID"),
    ),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.listSessions, (_, instanceId: unknown, agentId: unknown) =>
    openClawClientManager.listSessions(
      requireString(instanceId, "INSTANCE_ID"),
      requireString(agentId, "AGENT_ID"),
    ),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.createSession, (_, instanceId: unknown, agentId: unknown) =>
    openClawClientManager.createSession(
      requireString(instanceId, "INSTANCE_ID"),
      requireString(agentId, "AGENT_ID"),
    ),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.sendMessage, (_, input: unknown) =>
    openClawClientManager.sendMessage(parseSendMessageInput(input)),
  )
  ipcMain.handle(
    OPENCLAW_CHANNELS.deleteTurn,
    (_, instanceId: unknown, agentId: unknown, messageId: unknown) =>
      openClawClientManager.deleteTurn(
        requireString(instanceId, "INSTANCE_ID"),
        requireString(agentId, "AGENT_ID"),
        requireString(messageId, "MESSAGE_ID"),
      ),
  )
  ipcMain.handle(OPENCLAW_CHANNELS.abort, (_, instanceId: unknown, agentId: unknown) =>
    openClawClientManager.abort(
      requireString(instanceId, "INSTANCE_ID"),
      requireString(agentId, "AGENT_ID"),
    ),
  )
}
