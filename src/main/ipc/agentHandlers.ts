import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import type {
  AgentEvent,
  AgentMessage,
  AgentSendContext,
  McpServerStatusItem,
  PermissionResponse,
  QuestionResponse,
  SuggestedQuestionContextMessage,
} from "@shared/contracts/agent"
import { AGENT_CHANNELS } from "@shared/ipc/agentChannels"
import type { ModelSelection } from "@shared/settings"
import { ipcMain, shell, type WebContents } from "electron"
import { agentRunner } from "@/agent/agentRunner"
import { lspManager } from "@/agent/lsp/lspManager"
import { mcpManager } from "@/agent/mcp/mcpManager"
import { permissionManager } from "@/agent/permissions/permissionManager"
import { questionManager } from "@/agent/question/questionManager"
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

  const filesValid =
    context.files === undefined ||
    (Array.isArray(context.files) &&
      context.files.every(
        (f) =>
          f &&
          typeof f === "object" &&
          typeof f.name === "string" &&
          typeof f.path === "string" &&
          (f.type === "image" || f.type === "text") &&
          (f.size === undefined || typeof f.size === "string") &&
          (f.extension === undefined || typeof f.extension === "string"),
      ))

  return (
    isOptionalString(context.projectItemId) &&
    isOptionalString(context.projectId) &&
    isOptionalString(context.page) &&
    isOptionalString(context.cwd) &&
    filesValid
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

// 校验权限决策为合法 PermissionResponse（IPC 输入边界）。
const isValidPermissionResponse = (value: unknown): value is PermissionResponse => {
  if (!value || typeof value !== "object") return false
  const response = value as Record<string, unknown>
  if (typeof response.requestId !== "string" || !response.requestId) return false
  if (response.decision !== "allow" && response.decision !== "deny") return false
  return (
    (response.rememberForSession === undefined ||
      typeof response.rememberForSession === "boolean") &&
    (response.permanent === undefined || typeof response.permanent === "boolean")
  )
}

// 校验提问响应为合法 QuestionResponse（IPC 输入边界）：answers 数组或 dismissed 标志。
const isValidQuestionResponse = (value: unknown): value is QuestionResponse => {
  if (!value || typeof value !== "object") return false
  const response = value as Record<string, unknown>
  if (typeof response.requestId !== "string" || !response.requestId) return false
  if (response.dismissed === true) return true
  if (!Array.isArray(response.answers)) return false
  return response.answers.every((answer) => {
    if (!answer || typeof answer !== "object") return false
    const item = answer as Record<string, unknown>
    return (
      typeof item.question === "string" &&
      Array.isArray(item.answer) &&
      item.answer.every((entry) => typeof entry === "string")
    )
  })
}

// 命令是否存在于 PATH（跨平台分隔符）。
const isExecutableOnPath = (command: string): boolean => {
  const separator = process.platform === "win32" ? ";" : ":"
  const pathEntries = (process.env.PATH ?? "").split(separator).filter(Boolean)
  return pathEntries.some((dir) => existsSync(`${dir}/${command}`))
}

// 系统默认编辑器打开文件（openPath 不支持定位行；失败返回 ok:false）。
const openWithShell = async (filePath: string): Promise<{ ok: boolean }> => {
  try {
    const error = await shell.openPath(filePath)
    return { ok: error === "" }
  } catch {
    return { ok: false }
  }
}

// 打开文件并定位行：优先 VS Code CLI（code -g file:line），回退系统默认编辑器。
const openFileAt = (filePath: string, line: number): Promise<{ ok: boolean }> => {
  if (isExecutableOnPath("code")) {
    return new Promise((resolve) => {
      const child = spawn("code", ["-g", `${filePath}:${line}`], { stdio: "ignore" })
      child.on("error", () => {
        void openWithShell(filePath).then(resolve)
      })
      child.on("exit", () => resolve({ ok: true }))
    })
  }
  return openWithShell(filePath)
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
  // 权限确认请求经事件流推送到 renderer 命令面板（与 agent:event 同路径）。
  permissionManager.attachSender((request) =>
    sendToRenderer({ type: "permission_request", request }),
  )
  // 模型提问请求经事件流推送到 renderer 命令面板。
  questionManager.attachSender((request) => sendToRenderer({ type: "question_request", request }))

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

  ipcMain.handle(AGENT_CHANNELS.continue, async () => agentRunner.continue())

  // 手动压缩（/compact）：renderer 侧已守卫流式；main 侧兜底禁用/忙态/无可压缩内容。
  ipcMain.handle(AGENT_CHANNELS.compact, () => agentRunner.compact())

  // 撤销最后一次手动压缩（/undo 对压缩摘要触发；自动压缩不可撤销）。
  ipcMain.handle(AGENT_CHANNELS.undoCompaction, () => agentRunner.undoCompaction())

  ipcMain.handle(AGENT_CHANNELS.switchWorktree, (_, path: unknown) => {
    if (typeof path !== "string" || !path.trim()) {
      return { ok: false, error: "工作区路径无效。" }
    }
    return agentRunner.switchWorktree(path.trim())
  })

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

  // LSP server 安装状态与一键安装（状态栏指示；安装复用懒安装器）。
  ipcMain.handle(AGENT_CHANNELS.getLspStatus, () => lspManager.getStatus())
  ipcMain.handle(AGENT_CHANNELS.installLspServers, () => lspManager.installMissingServers())

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

  ipcMain.handle(AGENT_CHANNELS.getDefaultPath, () => join(homedir(), "Desktop"))

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

  ipcMain.handle(AGENT_CHANNELS.forkSession, (_, sessionId: unknown, timestamp: unknown) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new Error("INVALID_SESSION_ID")
    }
    if (timestamp !== undefined && (typeof timestamp !== "number" || !Number.isFinite(timestamp))) {
      throw new Error("INVALID_MESSAGE_TIMESTAMP")
    }
    return agentRunner.forkSession(sessionId, timestamp as number | undefined)
  })

  ipcMain.handle(AGENT_CHANNELS.permissionResponse, (_, response: unknown) => {
    if (!isValidPermissionResponse(response)) return { ok: false }
    return { ok: permissionManager.respond(response) }
  })

  ipcMain.handle(AGENT_CHANNELS.questionResponse, (_, response: unknown) => {
    if (!isValidQuestionResponse(response)) return { ok: false }
    const answers = "answers" in response ? response.answers : null
    return { ok: questionManager.respond(response.requestId, answers) }
  })

  ipcMain.handle(AGENT_CHANNELS.openFileAt, (_, filePath: unknown, line: unknown) => {
    if (typeof filePath !== "string" || !filePath || typeof line !== "number") {
      return { ok: false }
    }
    return openFileAt(filePath, line)
  })

  ipcMain.handle(AGENT_CHANNELS.getContextUsage, (_, selection: unknown) => {
    if (selection !== undefined && !isValidModelSelection(selection)) {
      throw new Error("INVALID_MODEL_SELECTION")
    }
    return agentRunner.getContextUsage(selection as ModelSelection | undefined)
  })
}
