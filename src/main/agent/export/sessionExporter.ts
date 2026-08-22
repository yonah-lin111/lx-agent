import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type {
  AgentRestoredSession,
  AgentSessionSummary,
  AssistantMessage,
  CopySessionOptions,
  ExportSessionOptions,
  ExportSessionResult,
  ToolResultMessage,
  UserMessage,
} from "@shared/contracts/agent"
import { dialog, shell } from "electron"
import { formatTimestamp, generateSessionHtml } from "./htmlTemplate"

/**
 * 将字符串转为安全的文件名 slug
 */
export function slugify(str: string): string {
  return str
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "-")
    .substring(0, 50)
}

/**
 * 导出会话为 Markdown 纯文本
 */
export function exportToMarkdown(
  session: AgentRestoredSession,
  summary?: Partial<AgentSessionSummary>,
): string {
  const title = summary?.title || "Agent 对话记录"
  const sessionId = summary?.id || "unknown"
  const createdAt = summary?.createdAt || new Date().toISOString()
  const cwd = summary?.cwd || "-"

  const lines: string[] = [
    `# ${title}`,
    "",
    `- **会话 ID**: \`${sessionId}\``,
    `- **创建时间**: ${formatTimestamp(createdAt)}`,
    `- **工作目录**: \`${cwd}\``,
    "",
    "---",
    "",
  ]

  // 匹配 toolResult 到前置 toolCall
  const toolResultsByCallId = new Map<string, ToolResultMessage>()
  for (const msg of session.messages) {
    if (msg.role === "toolResult") {
      toolResultsByCallId.set(msg.toolCallId, msg)
    }
  }

  // 任务清单
  if (session.todos && session.todos.length > 0) {
    lines.push("### 📋 任务清单（快照）", "")
    for (const item of session.todos) {
      const check = item.status === "completed" ? "x" : " "
      lines.push(`- [${check}] ${item.content}`)
    }
    lines.push("", "---", "")
  }

  for (const msg of session.messages) {
    if (msg.role === "user") {
      const userMsg = msg as UserMessage
      let userText = ""
      if (typeof userMsg.content === "string") {
        userText = userMsg.content
      } else if (Array.isArray(userMsg.content)) {
        userText = userMsg.content.map((c) => (c.type === "text" ? c.text : "[图片]")).join("\n")
      }

      const steerTag = userMsg.isSteer ? " `[Steer]`" : ""
      const cmdTag = userMsg.command ? ` \`[/${userMsg.command.name}]\`` : ""

      lines.push(
        `## 👤 用户${steerTag}${cmdTag} (${formatTimestamp(userMsg.timestamp)})`,
        "",
        userText,
      )

      if (userMsg.files?.length) {
        lines.push("", `*附件: ${userMsg.files.map((f) => `\`${f.name}\``).join(", ")}*`)
      }

      lines.push("", "---", "")
    } else if (msg.role === "assistant") {
      const asstMsg = msg as AssistantMessage
      const modelTag = asstMsg.model ? ` (${asstMsg.model})` : ""

      lines.push(`## 🤖 Agent${modelTag} (${formatTimestamp(asstMsg.timestamp)})`, "")

      for (const item of asstMsg.content) {
        if (item.type === "thinking") {
          lines.push(
            "<details>",
            `<summary>💭 思考过程 (${item.thinking?.length || 0} 字符)</summary>`,
            "",
            item.thinking || "",
            "",
            "</details>",
            "",
          )
        } else if (item.type === "text") {
          lines.push(item.text, "")
        } else if (item.type === "toolCall") {
          const toolResult = toolResultsByCallId.get(item.id)
          const status = toolResult?.isError ? "❌ 失败" : "✅ 成功"
          const argsJson = JSON.stringify(item.arguments, null, 2)
          let resultText = ""
          if (toolResult?.content) {
            resultText = toolResult.content
              .map((c) => (c.type === "text" ? c.text : "[图片]"))
              .join("\n")
          }

          lines.push(
            "<details>",
            `<summary>🔧 工具调用: <code>${item.name}</code> (${status})</summary>`,
            "",
            "**参数:**",
            "```json",
            argsJson,
            "```",
          )

          if (resultText) {
            lines.push("", "**结果:**", "```", resultText, "```")
          }

          lines.push("", "</details>", "")
        }
      }

      lines.push("---", "")
    } else if (msg.role === "compactionSummary") {
      lines.push(
        `> 📦 **[上下文压缩]** 压缩了 ~${msg.tokensBefore} Tokens`,
        `> ${msg.summary}`,
        "",
        "---",
        "",
      )
    }
  }

  return lines.join("\n")
}

/**
 * 导出会话为标准 JSONL 格式
 */
export function exportToJsonl(
  session: AgentRestoredSession,
  summary?: Partial<AgentSessionSummary>,
): string {
  const header = {
    type: "session_header",
    version: 1,
    id: summary?.id || "unknown",
    title: summary?.title || "Agent 对话",
    cwd: summary?.cwd || "",
    createdAt: summary?.createdAt || new Date().toISOString(),
    todos: session.todos || [],
  }

  const lines = [JSON.stringify(header)]

  for (const msg of session.messages) {
    lines.push(JSON.stringify(msg))
  }

  return `${lines.join("\n")}\n`
}

/**
 * 提取要复制到剪贴板的文本
 */
export function copySessionText(
  session: AgentRestoredSession,
  options?: CopySessionOptions,
  summary?: Partial<AgentSessionSummary>,
): string {
  if (options?.target === "last_assistant") {
    // 逆序查找最后一条助手回复
    for (let i = session.messages.length - 1; i >= 0; i--) {
      const msg = session.messages[i]
      if (msg.role === "assistant") {
        const asstMsg = msg as AssistantMessage
        const texts = asstMsg.content
          .filter((c) => c.type === "text")
          .map((c) => (c as { type: "text"; text: string }).text)
        if (texts.length > 0) {
          return texts.join("\n\n").trim()
        }
      }
    }
    return ""
  }

  // 默认复制完整 Markdown
  return exportToMarkdown(session, summary)
}

/**
 * 导出会话到文件（支持原生 SaveDialog 与指定路径）
 */
export async function exportSessionToFile(
  session: AgentRestoredSession,
  summary: AgentSessionSummary,
  options: ExportSessionOptions,
): Promise<ExportSessionResult> {
  let format: "html" | "markdown" | "jsonl" = options.format || "html"
  if (format === ("md" as string)) format = "markdown"
  if (format === ("json" as string)) format = "jsonl"

  const defaultExt = format === "html" ? "html" : format === "markdown" ? "md" : "jsonl"
  const filterName =
    format === "html"
      ? "HTML 网页 (*.html)"
      : format === "markdown"
        ? "Markdown 文档 (*.md)"
        : "JSONL 数据文件 (*.jsonl)"

  let targetPath = options.customPath

  if (!targetPath) {
    const timestampStr = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
    const defaultFileName = `${slugify(summary.title || "session")}-${timestampStr}.${defaultExt}`

    const dialogResult = await dialog.showSaveDialog({
      title: `导出对话为 ${filterName}`,
      defaultPath: defaultFileName,
      filters: [
        { name: filterName, extensions: [defaultExt] },
        { name: "全部文件", extensions: ["*"] },
      ],
    })

    if (dialogResult.canceled || !dialogResult.filePath) {
      return { ok: true, canceled: true }
    }

    targetPath = dialogResult.filePath
  }

  // 依据最终文件后缀名二次校验格式（防止用户在保存对话框中自定义了扩展名）
  const lowerPath = targetPath.toLowerCase()
  if (lowerPath.endsWith(".md") || lowerPath.endsWith(".markdown")) {
    format = "markdown"
  } else if (lowerPath.endsWith(".jsonl") || lowerPath.endsWith(".json")) {
    format = "jsonl"
  } else if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm")) {
    format = "html"
  }

  // 生成内容
  let content = ""
  if (format === "html") {
    content = generateSessionHtml(session, summary)
  } else if (format === "markdown") {
    content = exportToMarkdown(session, summary)
  } else if (format === "jsonl") {
    content = exportToJsonl(session, summary)
  }

  // 确保目标目录存在并写入
  const dir = dirname(targetPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  writeFileSync(targetPath, content, "utf-8")

  // 若需要导出后打开
  if (options.openAfterExport) {
    if (format === "html") {
      shell.openPath(targetPath).catch(() => {})
    } else {
      shell.showItemInFolder(targetPath)
    }
  }

  return { ok: true, filePath: targetPath }
}
