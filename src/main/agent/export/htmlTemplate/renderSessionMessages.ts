import type {
  AgentRestoredSession,
  AssistantMessage,
  CompactionSummaryMessage,
  ToolResultMessage,
  UserMessage,
} from "@shared/contracts/agent"
import { escapeHtml, formatTimestamp, simpleMarkdownToHtml } from "./htmlUtils"

export type SessionMessageStats = {
  userTurnCount: number
  assistantTurnCount: number
  totalToolCalls: number
  totalInputTokens: number
  totalOutputTokens: number
}

export type RenderedSessionMessages = {
  messagesHtml: string[]
  todosHtml: string
  stats: SessionMessageStats
}

/**
 * 渲染会话消息流、待办清单快照与统计计数。
 */
export function renderSessionMessages(session: AgentRestoredSession): RenderedSessionMessages {
  let userTurnCount = 0
  let assistantTurnCount = 0
  let totalToolCalls = 0
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const messagesHtml: string[] = []

  // 匹配 toolResult 到前置 toolCall 的辅助 map
  const toolResultsByCallId = new Map<string, ToolResultMessage>()
  for (const msg of session.messages) {
    if (msg.role === "toolResult") {
      toolResultsByCallId.set(msg.toolCallId, msg)
    }
  }

  for (const msg of session.messages) {
    if (msg.role === "user") {
      userTurnCount++
      const userMsg = msg as UserMessage
      let userText = ""
      if (typeof userMsg.content === "string") {
        userText = userMsg.content
      } else if (Array.isArray(userMsg.content)) {
        userText = userMsg.content.map((c) => (c.type === "text" ? c.text : "[图片]")).join("\n")
      }

      const steerBadge = userMsg.isSteer
        ? '<span class="badge badge-steer">⚡ 即时插话 / Steer</span>'
        : ""
      const commandBadge = userMsg.command
        ? `<span class="badge badge-cmd">/${escapeHtml(userMsg.command.name)}</span>`
        : ""

      const filesHtml = userMsg.files?.length
        ? `<div class="files-attachment">${userMsg.files
            .map(
              (f) =>
                `<span class="file-tag"><svg class="tag-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>${escapeHtml(f.name)}</span>`,
            )
            .join(" ")}</div>`
        : ""

      messagesHtml.push(`
        <article class="message user-message">
          <header class="message-header">
            <div class="user-meta">
              <div class="avatar user-avatar">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
              </div>
              <span class="sender-name">用户</span>
              ${steerBadge}
              ${commandBadge}
            </div>
            <time class="message-time">${formatTimestamp(userMsg.timestamp)}</time>
          </header>
          <div class="message-body">
            <div class="markdown-prose">${simpleMarkdownToHtml(userText)}</div>
            ${filesHtml}
          </div>
        </article>
      `)
    } else if (msg.role === "assistant") {
      assistantTurnCount++
      const asstMsg = msg as AssistantMessage
      if (asstMsg.usage) {
        totalInputTokens += asstMsg.usage.input || 0
        totalOutputTokens += asstMsg.usage.output || 0
      }

      const bodyParts: string[] = []

      for (const item of asstMsg.content) {
        if (item.type === "thinking") {
          bodyParts.push(`
            <details class="accordion thinking-block">
              <summary>
                <div class="summary-left">
                  <span class="accordion-chevron">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </span>
                  <span class="icon">💭</span>
                  <span class="summary-title">思考过程</span>
                  <span class="summary-badge">${escapeHtml(item.thinking?.length ? `${item.thinking.length} 字符` : "展开")}</span>
                </div>
              </summary>
              <div class="accordion-content thinking-content">
                ${escapeHtml(item.thinking)}
              </div>
            </details>
          `)
        } else if (item.type === "text") {
          bodyParts.push(
            `<div class="assistant-text markdown-prose">${simpleMarkdownToHtml(item.text)}</div>`,
          )
        } else if (item.type === "toolCall") {
          totalToolCalls++
          const toolResult = toolResultsByCallId.get(item.id)
          const isError = toolResult?.isError ?? false
          const statusClass = isError ? "tool-status-error" : "tool-status-success"
          const statusText = isError ? "执行失败" : "执行成功"
          const statusIcon = isError
            ? `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`
            : `<svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>`

          let resultText = ""
          if (toolResult?.content) {
            resultText = toolResult.content
              .map((c) => (c.type === "text" ? c.text : "[图片数据]"))
              .join("\n")
          }

          const argsJson = JSON.stringify(item.arguments, null, 2)
          let diffHtml = ""
          if (toolResult?.diff?.lines && toolResult.diff.lines.length > 0) {
            const diffRows = toolResult.diff.lines
              .map((l) => {
                const lineClass =
                  l.type === "add"
                    ? "diff-line-add"
                    : l.type === "del"
                      ? "diff-line-del"
                      : "diff-line-ctx"
                const sign = l.type === "add" ? "+" : l.type === "del" ? "-" : " "
                return `<div class="diff-line ${lineClass}"><span class="diff-sign">${sign}</span><span class="diff-code">${escapeHtml(l.text)}</span></div>`
              })
              .join("")
            diffHtml = `<div class="tool-diff-container"><div class="tool-section-title">文件修改 Diff</div><div class="diff-viewer">${diffRows}</div></div>`
          }

          bodyParts.push(`
            <details class="accordion tool-call-block">
              <summary>
                <div class="tool-summary-header">
                  <span class="accordion-chevron">
                    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                  </span>
                  <span class="icon">🔧</span>
                  <span class="tool-name">${escapeHtml(item.name)}</span>
                  <span class="tool-badge ${statusClass}">${statusIcon} ${statusText}</span>
                </div>
              </summary>
              <div class="accordion-content tool-content-inner">
                <div class="tool-section">
                  <div class="tool-section-header">
                    <span class="tool-section-title">调用参数</span>
                    <button class="copy-btn mini" onclick="copySnippet(this)">复制</button>
                  </div>
                  <pre class="json-code"><code>${escapeHtml(argsJson)}</code></pre>
                </div>
                ${
                  resultText
                    ? `<div class="tool-section">
                         <div class="tool-section-header">
                           <span class="tool-section-title">执行输出</span>
                           <button class="copy-btn mini" onclick="copySnippet(this)">复制</button>
                         </div>
                         <pre class="result-code"><code>${escapeHtml(resultText)}</code></pre>
                       </div>`
                    : ""
                }
                ${diffHtml}
              </div>
            </details>
          `)
        }
      }

      const modelBadge = asstMsg.model
        ? `<span class="badge badge-model">${escapeHtml(asstMsg.model)}</span>`
        : ""
      const tokenBadge = asstMsg.usage
        ? `<span class="token-info">In: ${asstMsg.usage.input} / Out: ${asstMsg.usage.output}</span>`
        : ""

      messagesHtml.push(`
        <article class="message assistant-message">
          <header class="message-header">
            <div class="assistant-meta">
              <div class="avatar assistant-avatar">
                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"></path><rect x="4" y="8" width="16" height="12" rx="2"></rect><circle cx="9" cy="13" r="1"></circle><circle cx="15" cy="13" r="1"></circle></svg>
              </div>
              <span class="sender-name">Agent</span>
              ${modelBadge}
            </div>
            <div class="header-right">
              ${tokenBadge}
              <time class="message-time">${formatTimestamp(asstMsg.timestamp)}</time>
            </div>
          </header>
          <div class="message-body">
            ${bodyParts.join("\n")}
          </div>
        </article>
      `)
    } else if (msg.role === "compactionSummary") {
      const compMsg = msg as CompactionSummaryMessage
      messagesHtml.push(`
        <div class="message-system compaction-block">
          <div class="compaction-title">
            <span class="icon">📦</span>
            <strong>上下文压缩边界</strong>
            <span class="badge badge-compaction">压缩了 ~${compMsg.tokensBefore} Tokens</span>
          </div>
          <div class="compaction-summary">${escapeHtml(compMsg.summary)}</div>
        </div>
      `)
    }
  }

  const todosHtml = session.todos?.length
    ? `
      <section class="todos-card">
        <header class="todos-header">
          <div class="todos-title-wrap">
            <svg class="todos-icon" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
            <h3>任务清单（快照）</h3>
          </div>
          <span class="todos-count">${session.todos.filter((t) => t.status === "completed").length}/${session.todos.length} 已完成</span>
        </header>
        <ul class="todo-list">
          ${session.todos
            .map((t) => {
              const isDone = t.status === "completed"
              const checkIcon = isDone
                ? `<span class="todo-check done"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`
                : `<span class="todo-check pending"></span>`
              return `<li class="${isDone ? "todo-completed" : ""}">${checkIcon}<span>${escapeHtml(t.content)}</span></li>`
            })
            .join("")}
        </ul>
      </section>
    `
    : ""

  return {
    messagesHtml,
    todosHtml,
    stats: {
      userTurnCount,
      assistantTurnCount,
      totalToolCalls,
      totalInputTokens,
      totalOutputTokens,
    },
  }
}
