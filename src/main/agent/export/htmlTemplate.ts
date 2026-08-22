import type {
  AgentRestoredSession,
  AgentSessionSummary,
  AssistantMessage,
  CompactionSummaryMessage,
  ToolResultMessage,
  UserMessage,
} from "@shared/contracts/agent"

/**
 * HTML 转义函数，防止 XSS
 */
export function escapeHtml(str: string | undefined | null): string {
  if (!str) return ""
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

/**
 * 格式化时间戳为易读字符串
 */
export function formatTimestamp(ts: number | string | undefined): string {
  if (!ts) return ""
  const date = typeof ts === "number" ? new Date(ts) : new Date(ts)
  if (Number.isNaN(date.getTime())) return String(ts)
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

/**
 * 简易 Markdown 转 HTML 转换器（自包含，不依赖外部库）
 */
export function simpleMarkdownToHtml(markdown: string): string {
  if (!markdown) return ""

  // 占位存储代码块，防止内联规则破坏代码块
  const codeBlocks: string[] = []
  let text = markdown.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`
    const escapedCode = escapeHtml(code.trimEnd())
    const langLabel = lang
      ? `<span class="code-lang">${escapeHtml(lang)}</span>`
      : '<span class="code-lang">code</span>'
    codeBlocks.push(
      `<div class="code-block-wrapper">
        <div class="code-header">
          ${langLabel}
          <button class="copy-btn" onclick="copyCode(this)">
            <svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            <span class="btn-text">复制</span>
          </button>
        </div>
        <pre><code>${escapedCode}</code></pre>
      </div>`,
    )
    return placeholder
  })

  // 行内代码
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)

  // 转义常规 HTML
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  // 恢复代码块占位符
  codeBlocks.forEach((block, idx) => {
    text = text.replace(`__CODE_BLOCK_${idx}__`, block)
  })

  // 标题
  text = text.replace(/^### (.*$)/gim, "<h3>$1</h3>")
  text = text.replace(/^## (.*$)/gim, "<h2>$1</h2>")
  text = text.replace(/^# (.*$)/gim, "<h1>$1</h1>")

  // 加粗与斜体
  text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
  text = text.replace(/\*(.*?)\*/g, "<em>$1</em>")

  // 引用块
  text = text.replace(/^\> (.*$)/gim, "<blockquote>$1</blockquote>")

  // 无序列表
  text = text.replace(/^\s*[-*+]\s+(.*$)/gim, "<li>$1</li>")

  // 段落换行（将连续换行转为段落或换行）
  text = text
    .split(/\n\n+/)
    .map((para) => {
      para = para.trim()
      if (!para) return ""
      if (
        para.startsWith('<div class="code-block-wrapper"') ||
        para.startsWith("<h1>") ||
        para.startsWith("<h2>") ||
        para.startsWith("<h3>") ||
        para.startsWith("<blockquote>") ||
        para.startsWith("<li>")
      ) {
        return para
      }
      return `<p>${para.replace(/\n/g, "<br/>")}</p>`
    })
    .join("\n")

  return text
}

/**
 * 生成内嵌的独立交互式 HTML 会话报告（Emil Kowalski & Apple Fluid Design）
 */
export function generateSessionHtml(
  session: AgentRestoredSession,
  summary?: Partial<AgentSessionSummary>,
): string {
  const title = summary?.title || "Agent 对话导出报告"
  const sessionId = summary?.id || "unknown-session"
  const createdAt = summary?.createdAt || new Date().toISOString()
  const cwd = summary?.cwd || "-"

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

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Agent 对话导出报告</title>
  <style>
    :root {
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
      --font-sans: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: "SF Mono", "Fira Code", Menlo, Monaco, Consolas, monospace;
      
      --bg-base: #09090b;
      --bg-surface: #121215;
      --bg-surface-raised: #18181b;
      --bg-surface-elevated: #202024;
      --bg-hover: rgba(255, 255, 255, 0.06);
      --bg-active: rgba(255, 255, 255, 0.1);
      
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-medium: rgba(255, 255, 255, 0.14);
      --border-focus: rgba(56, 189, 248, 0.5);
      
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-tertiary: #71717a;
      
      --accent-blue: #38bdf8;
      --accent-blue-subtle: rgba(56, 189, 248, 0.12);
      --accent-emerald: #34d399;
      --accent-emerald-subtle: rgba(52, 211, 153, 0.12);
      --accent-amber: #fbbf24;
      --accent-amber-subtle: rgba(251, 191, 36, 0.12);
      --accent-rose: #fb7185;
      --accent-rose-subtle: rgba(251, 113, 133, 0.12);
      --accent-purple: #c084fc;
      --accent-purple-subtle: rgba(192, 132, 252, 0.12);
      
      --code-bg: #0d0d10;
      --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
      --shadow-md: 0 4px 12px 0 rgba(0, 0, 0, 0.4);
      --glass-bg: rgba(18, 18, 21, 0.75);
      --glass-border: rgba(255, 255, 255, 0.1);
    }

    :root[data-theme="light"] {
      --bg-base: #f8f9fa;
      --bg-surface: #ffffff;
      --bg-surface-raised: #f4f4f6;
      --bg-surface-elevated: #eaeaed;
      --bg-hover: rgba(0, 0, 0, 0.04);
      --bg-active: rgba(0, 0, 0, 0.08);
      
      --border-subtle: rgba(0, 0, 0, 0.07);
      --border-medium: rgba(0, 0, 0, 0.12);
      --border-focus: rgba(2, 132, 199, 0.5);
      
      --text-primary: #18181b;
      --text-secondary: #52525b;
      --text-tertiary: #a1a1aa;
      
      --accent-blue: #0284c7;
      --accent-blue-subtle: rgba(2, 132, 199, 0.08);
      --accent-emerald: #059669;
      --accent-emerald-subtle: rgba(5, 150, 105, 0.08);
      --accent-amber: #d97706;
      --accent-amber-subtle: rgba(217, 119, 6, 0.08);
      --accent-rose: #e11d48;
      --accent-rose-subtle: rgba(225, 29, 72, 0.08);
      --accent-purple: #7c3aed;
      --accent-purple-subtle: rgba(124, 58, 237, 0.08);
      
      --code-bg: #f4f4f6;
      --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
      --shadow-md: 0 4px 16px 0 rgba(0, 0, 0, 0.06);
      --glass-bg: rgba(255, 255, 255, 0.82);
      --glass-border: rgba(0, 0, 0, 0.08);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: var(--font-sans);
      background-color: var(--bg-base);
      color: var(--text-primary);
      line-height: 1.6;
      font-size: 14px;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      padding-bottom: 64px;
    }

    /* 顶部毛玻璃导航条 */
    .sticky-header {
      position: sticky;
      top: 0;
      z-index: 100;
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      background: var(--glass-bg);
      border-bottom: 1px solid var(--glass-border);
      transition: background 200ms var(--ease-out);
    }
    .header-inner {
      max-width: 920px;
      margin: 0 auto;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .header-branding {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: linear-gradient(135deg, #0284c7, #7c3aed);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
      box-shadow: var(--shadow-sm);
      flex-shrink: 0;
    }
    .header-titles {
      min-width: 0;
    }
    .header-titles h1 {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    /* 按钮规范与微动效 */
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
      transition: transform 160ms var(--ease-out), background 160ms var(--ease-out), border-color 160ms var(--ease-out);
      user-select: none;
    }
    @media (hover: hover) and (pointer: fine) {
      .btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-medium);
      }
    }
    .btn:active {
      transform: scale(0.97);
    }

    .main-container {
      max-width: 920px;
      margin: 28px auto 0;
      padding: 0 20px;
    }

    /* 会话详情概览卡片 */
    .session-hero-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 20px 24px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }
    .hero-meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-top: 14px;
      padding-top: 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 12px;
      color: var(--text-secondary);
    }
    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meta-item .meta-label {
      color: var(--text-tertiary);
    }
    .meta-item code {
      font-family: var(--font-mono);
      font-size: 11px;
      background: var(--bg-surface-raised);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid var(--border-subtle);
    }

    /* 统计网格 */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    @media (max-width: 640px) {
      .stats-grid { grid-template-columns: repeat(2, 1fr); }
    }
    .stat-pill {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 12px 16px;
      transition: transform 160ms var(--ease-out), border-color 160ms var(--ease-out);
    }
    @media (hover: hover) and (pointer: fine) {
      .stat-pill:hover {
        border-color: var(--border-medium);
        transform: translateY(-1px);
      }
    }
    .stat-pill .stat-label {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }
    .stat-pill .stat-value {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
      color: var(--text-primary);
    }

    /* 任务清单快照 */
    .todos-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      padding: 18px 20px;
      margin-bottom: 24px;
      box-shadow: var(--shadow-sm);
    }
    .todos-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .todos-title-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .todos-icon { color: var(--accent-emerald); }
    .todos-header h3 {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }
    .todos-count {
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--accent-emerald-subtle);
      color: var(--accent-emerald);
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 500;
    }
    .todo-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .todo-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .todo-check {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .todo-check.done {
      background: var(--accent-emerald);
      color: #fff;
    }
    .todo-check.pending {
      border: 1.5px solid var(--text-tertiary);
    }
    .todo-completed span {
      text-decoration: line-through;
      color: var(--text-tertiary);
    }

    /* 消息流与卡片 */
    .chat-stream {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .message {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      overflow: hidden;
      box-shadow: var(--shadow-sm);
      transition: border-color 160ms var(--ease-out);
    }
    .user-message {
      border-left: 3px solid var(--accent-blue);
    }
    .assistant-message {
      border-left: 3px solid var(--accent-purple);
    }
    .message-header {
      padding: 12px 18px;
      background: var(--bg-surface-raised);
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border-subtle);
      font-size: 13px;
    }
    .user-meta, .assistant-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .avatar {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-avatar { background: var(--accent-blue-subtle); color: var(--accent-blue); }
    .assistant-avatar { background: var(--accent-purple-subtle); color: var(--accent-purple); }
    .sender-name { font-weight: 600; color: var(--text-primary); }
    .message-time { color: var(--text-tertiary); font-size: 11px; }
    .header-right { display: flex; align-items: center; gap: 10px; }
    .token-info {
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text-tertiary);
      background: var(--bg-surface-elevated);
      padding: 2px 6px;
      border-radius: 4px;
    }

    .message-body {
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* 徽章 Badge */
    .badge {
      font-size: 11px;
      font-weight: 500;
      padding: 2px 7px;
      border-radius: 6px;
      line-height: 1.3;
    }
    .badge-steer { background: var(--accent-amber-subtle); color: var(--accent-amber); border: 1px solid rgba(251, 191, 36, 0.2); }
    .badge-cmd { background: var(--accent-blue-subtle); color: var(--accent-blue); border: 1px solid rgba(56, 189, 248, 0.2); }
    .badge-model { background: var(--accent-purple-subtle); color: var(--accent-purple); border: 1px solid rgba(192, 132, 252, 0.2); }
    .badge-compaction { background: var(--accent-emerald-subtle); color: var(--accent-emerald); border: 1px solid rgba(52, 211, 153, 0.2); }

    /* Markdown 排版 Prose */
    .markdown-prose {
      font-size: 14px;
      line-height: 1.65;
      color: var(--text-primary);
    }
    .markdown-prose p { margin-bottom: 10px; }
    .markdown-prose p:last-child { margin-bottom: 0; }
    .markdown-prose h1, .markdown-prose h2, .markdown-prose h3 {
      font-weight: 600;
      letter-spacing: -0.015em;
      margin: 16px 0 8px;
      color: var(--text-primary);
    }
    .markdown-prose h1 { font-size: 18px; }
    .markdown-prose h2 { font-size: 16px; }
    .markdown-prose h3 { font-size: 14px; }
    .markdown-prose code {
      font-family: var(--font-mono);
      font-size: 12.5px;
      background: var(--code-bg);
      border: 1px solid var(--border-subtle);
      padding: 2px 5px;
      border-radius: 4px;
      color: var(--accent-blue);
    }
    .markdown-prose blockquote {
      border-left: 3px solid var(--accent-blue);
      padding: 6px 12px;
      margin: 10px 0;
      background: var(--accent-blue-subtle);
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);
      font-size: 13px;
    }
    .markdown-prose li {
      margin-left: 18px;
      margin-bottom: 4px;
    }

    /* 代码块与复制 */
    .code-block-wrapper {
      background: var(--code-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      margin: 12px 0;
      overflow: hidden;
    }
    .code-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 12px;
      background: var(--bg-surface-raised);
      border-bottom: 1px solid var(--border-subtle);
      font-size: 11px;
    }
    .code-lang {
      font-family: var(--font-mono);
      color: var(--text-tertiary);
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
    }
    .code-block-wrapper pre {
      padding: 12px 14px;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12.5px;
      line-height: 1.5;
    }
    .code-block-wrapper pre code {
      background: transparent;
      border: none;
      padding: 0;
      color: var(--text-primary);
    }

    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      border: 1px solid var(--border-subtle);
      color: var(--text-secondary);
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 11px;
      cursor: pointer;
      transition: transform 120ms var(--ease-out), color 120ms, border-color 120ms;
    }
    @media (hover: hover) and (pointer: fine) {
      .copy-btn:hover {
        color: var(--text-primary);
        border-color: var(--border-medium);
        background: var(--bg-hover);
      }
    }
    .copy-btn:active {
      transform: scale(0.95);
    }
    .copy-btn.mini {
      padding: 2px 6px;
      font-size: 10px;
    }

    /* 手风琴折叠块（思考过程 / 工具调用） */
    .accordion {
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--bg-surface-raised);
      overflow: hidden;
      transition: border-color 160ms var(--ease-out), box-shadow 160ms var(--ease-out);
    }
    .accordion[open] {
      border-color: var(--border-medium);
    }
    .accordion summary {
      padding: 10px 14px;
      cursor: pointer;
      list-style: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      user-select: none;
      font-size: 13px;
      font-weight: 500;
      transition: background 140ms;
    }
    .accordion summary::-webkit-details-marker { display: none; }
    @media (hover: hover) and (pointer: fine) {
      .accordion summary:hover {
        background: var(--bg-hover);
      }
    }
    .summary-left, .tool-summary-header {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .accordion-chevron {
      color: var(--text-tertiary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: transform 180ms var(--ease-out);
    }
    .accordion[open] .accordion-chevron {
      transform: rotate(90deg);
    }
    .summary-title { color: var(--text-primary); font-weight: 500; }
    .summary-badge {
      font-size: 11px;
      color: var(--text-tertiary);
      background: var(--bg-surface-elevated);
      padding: 1px 6px;
      border-radius: 4px;
    }
    .accordion-content {
      padding: 12px 14px;
      border-top: 1px solid var(--border-subtle);
      font-size: 13px;
      background: var(--bg-surface);
    }
    .thinking-content {
      color: var(--text-secondary);
      font-family: var(--font-sans);
      white-space: pre-wrap;
      line-height: 1.6;
    }
    .thinking-block {
      border-color: rgba(251, 191, 36, 0.2);
    }

    /* 工具调用样式 */
    .tool-call-block {
      border-color: var(--border-subtle);
    }
    .tool-name {
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: 600;
      color: var(--accent-blue);
    }
    .tool-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    .tool-status-success {
      background: var(--accent-emerald-subtle);
      color: var(--accent-emerald);
    }
    .tool-status-error {
      background: var(--accent-rose-subtle);
      color: var(--accent-rose);
    }
    .tool-content-inner {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tool-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tool-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .tool-section-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-tertiary);
    }
    .json-code, .result-code {
      background: var(--code-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 10px 12px;
      overflow-x: auto;
      font-family: var(--font-mono);
      font-size: 12px;
      line-height: 1.45;
      color: var(--text-primary);
    }

    /* Diff 视图 */
    .tool-diff-container {
      margin-top: 6px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .diff-viewer {
      background: var(--code-bg);
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 8px 0;
      font-family: var(--font-mono);
      font-size: 12px;
      overflow-x: auto;
    }
    .diff-line {
      display: flex;
      padding: 1px 12px;
      line-height: 1.45;
      white-space: pre;
    }
    .diff-sign { width: 18px; user-select: none; font-weight: 600; }
    .diff-line-add { background: var(--accent-emerald-subtle); color: var(--accent-emerald); }
    .diff-line-del { background: var(--accent-rose-subtle); color: var(--accent-rose); }
    .diff-line-ctx { color: var(--text-secondary); }

    /* 附件标签 */
    .files-attachment {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .file-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bg-surface-raised);
      border: 1px solid var(--border-subtle);
      padding: 3px 8px;
      border-radius: 6px;
      font-size: 12px;
      color: var(--text-secondary);
    }
    .tag-icon { color: var(--text-tertiary); }

    /* 上下文压缩条目 */
    .compaction-block {
      background: var(--bg-surface);
      border: 1px dashed var(--accent-emerald);
      border-radius: 12px;
      padding: 14px 18px;
    }
    .compaction-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .compaction-summary {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    @media print {
      .sticky-header { position: static; background: #fff; }
      .header-actions { display: none; }
      body { background: #fff; color: #000; padding: 0; }
      .message { break-inside: avoid; border: 1px solid #ddd; }
      details { open: true !important; }
    }
  </style>
</head>
<body>
  <header class="sticky-header">
    <div class="header-inner">
      <div class="header-branding">
        <div class="logo-badge">LX</div>
        <div class="header-titles">
          <h1>${escapeHtml(title)}</h1>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn" onclick="toggleAllTools()" title="展开/收起全部工具调用与思考">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline></svg>
          <span>折叠切换</span>
        </button>
        <button class="btn" onclick="toggleTheme()" title="切换明亮/暗黑主题">
          <svg class="theme-icon" viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
          <span id="theme-btn-text">主题</span>
        </button>
      </div>
    </div>
  </header>

  <main class="main-container">
    <section class="session-hero-card">
      <h2>${escapeHtml(title)}</h2>
      <div class="hero-meta-grid">
        <div class="meta-item">
          <span class="meta-label">会话 ID:</span>
          <code>${escapeHtml(sessionId)}</code>
        </div>
        <div class="meta-item">
          <span class="meta-label">创建时间:</span>
          <span>${formatTimestamp(createdAt)}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">工作目录:</span>
          <code>${escapeHtml(cwd)}</code>
        </div>
      </div>
    </section>

    <section class="stats-grid">
      <div class="stat-pill">
        <div class="stat-label">用户提问</div>
        <div class="stat-value">${userTurnCount}</div>
      </div>
      <div class="stat-pill">
        <div class="stat-label">Agent 回答</div>
        <div class="stat-value">${assistantTurnCount}</div>
      </div>
      <div class="stat-pill">
        <div class="stat-label">工具调用</div>
        <div class="stat-value">${totalToolCalls}</div>
      </div>
      <div class="stat-pill">
        <div class="stat-label">Token 消耗</div>
        <div class="stat-value">${(totalInputTokens + totalOutputTokens).toLocaleString()}</div>
      </div>
    </section>

    ${todosHtml}

    <section class="chat-stream">
      ${messagesHtml.join("\n")}
    </section>
  </main>

  <script>
    function copyCode(button) {
      const code = button.closest('.code-block-wrapper').querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        const textSpan = button.querySelector('.btn-text');
        const originalText = textSpan.innerText;
        textSpan.innerText = '已复制!';
        button.style.borderColor = 'var(--accent-emerald)';
        button.style.color = 'var(--accent-emerald)';
        setTimeout(() => {
          textSpan.innerText = originalText;
          button.style.borderColor = '';
          button.style.color = '';
        }, 1500);
      });
    }

    function copySnippet(button) {
      const code = button.closest('.tool-section').querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        const originalText = button.innerText;
        button.innerText = '已复制!';
        button.style.borderColor = 'var(--accent-emerald)';
        button.style.color = 'var(--accent-emerald)';
        setTimeout(() => {
          button.innerText = originalText;
          button.style.borderColor = '';
          button.style.color = '';
        }, 1500);
      });
    }

    let allExpanded = false;
    function toggleAllTools() {
      allExpanded = !allExpanded;
      document.querySelectorAll('details.tool-call-block, details.thinking-block').forEach(d => {
        d.open = allExpanded;
      });
    }

    function toggleTheme() {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
    }
  </script>
</body>
</html>`
}
