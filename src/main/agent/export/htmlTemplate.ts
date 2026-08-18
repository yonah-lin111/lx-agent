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
    const langLabel = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ""
    codeBlocks.push(
      `<div class="code-block-wrapper"><div class="code-header">${langLabel}<button class="copy-btn" onclick="copyCode(this)">复制</button></div><pre><code>${escapedCode}</code></pre></div>`,
    )
    return placeholder
  })

  // 行内代码
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`)

  // 转义常规 HTML
  text = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

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
        para.startsWith("<div class=\"code-block-wrapper\"") ||
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
 * 生成内嵌的独立交互式 HTML 会话报告
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
        userText = userMsg.content
          .map((c) => (c.type === "text" ? c.text : "[图片]"))
          .join("\n")
      }

      const steerBadge = userMsg.isSteer
        ? '<span class="badge badge-steer">即时插话 / Steer</span>'
        : ""
      const commandBadge = userMsg.command
        ? `<span class="badge badge-cmd">${escapeHtml(userMsg.command.name)}</span>`
        : ""

      const filesHtml = userMsg.files?.length
        ? `<div class="files-attachment">${userMsg.files
            .map((f) => `<span class="file-tag">📎 ${escapeHtml(f.name)}</span>`)
            .join(" ")}</div>`
        : ""

      messagesHtml.push(`
        <div class="message user-message">
          <div class="message-header">
            <div class="user-meta">
              <span class="avatar user-avatar">👤</span>
              <span class="sender-name">用户</span>
              ${steerBadge}
              ${commandBadge}
            </div>
            <span class="message-time">${formatTimestamp(userMsg.timestamp)}</span>
          </div>
          <div class="message-body">
            ${simpleMarkdownToHtml(userText)}
            ${filesHtml}
          </div>
        </div>
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
              <summary><span class="icon">💭</span> 思考过程 (${escapeHtml(item.thinking?.length ? `${item.thinking.length} 字符` : "展开")})</summary>
              <div class="accordion-content thinking-content">
                ${escapeHtml(item.thinking)}
              </div>
            </details>
          `)
        } else if (item.type === "text") {
          bodyParts.push(
            `<div class="assistant-text">${simpleMarkdownToHtml(item.text)}</div>`,
          )
        } else if (item.type === "toolCall") {
          totalToolCalls++
          const toolResult = toolResultsByCallId.get(item.id)
          const isError = toolResult?.isError ?? false
          const statusClass = isError ? "tool-status-error" : "tool-status-success"
          const statusText = isError ? "执行失败" : "执行成功"

          let resultText = ""
          if (toolResult?.content) {
            resultText = toolResult.content
              .map((c) => (c.type === "text" ? c.text : "[图片数据]"))
              .join("\n")
          }

          const argsJson = JSON.stringify(item.arguments, null, 2)

          let diffBlock = ""
          if (toolResult?.diff?.lines?.length) {
            const diffLines = toolResult.diff.lines
              .map((line) => {
                const prefix = line.type === "add" ? "+" : line.type === "del" ? "-" : " "
                const cls = line.type === "add" ? "diff-add" : line.type === "del" ? "diff-del" : "diff-ctx"
                return `<span class="${cls}">${prefix} ${escapeHtml(line.text)}</span>`
              })
              .join("\n")
            diffBlock = `<div class="diff-viewer"><div class="diff-header">${escapeHtml(toolResult.diff.fileName || "变更对比")} (+${toolResult.diff.stats.added} / -${toolResult.diff.stats.removed})</div><pre class="diff-pre"><code>${diffLines}</code></pre></div>`
          }

          bodyParts.push(`
            <details class="accordion tool-call-block">
              <summary>
                <div class="tool-summary-header">
                  <span class="icon">🔧</span>
                  <span class="tool-name">${escapeHtml(item.name)}</span>
                  <span class="tool-badge ${statusClass}">${statusText}</span>
                </div>
              </summary>
              <div class="accordion-content">
                <div class="tool-section">
                  <div class="tool-section-title">调用参数：</div>
                  <pre class="json-code"><code>${escapeHtml(argsJson)}</code></pre>
                </div>
                ${
                  resultText
                    ? `<div class="tool-section">
                        <div class="tool-section-title">执行输出：</div>
                        <pre class="result-code"><code>${escapeHtml(resultText)}</code></pre>
                       </div>`
                    : ""
                }
                ${diffBlock}
              </div>
            </details>
          `)
        }
      }

      const modelBadge = asstMsg.model
        ? `<span class="badge badge-model">${escapeHtml(asstMsg.model)}</span>`
        : ""
      const tokenInfo = asstMsg.usage
        ? `<span class="token-info">入: ${asstMsg.usage.input} | 出: ${asstMsg.usage.output} tokens</span>`
        : ""

      messagesHtml.push(`
        <div class="message assistant-message">
          <div class="message-header">
            <div class="assistant-meta">
              <span class="avatar assistant-avatar">🤖</span>
              <span class="sender-name">Agent</span>
              ${modelBadge}
            </div>
            <div class="header-right">
              ${tokenInfo}
              <span class="message-time">${formatTimestamp(asstMsg.timestamp)}</span>
            </div>
          </div>
          <div class="message-body">
            ${bodyParts.join("\n")}
          </div>
        </div>
      `)
    } else if (msg.role === "compactionSummary") {
      const comp = msg as CompactionSummaryMessage
      messagesHtml.push(`
        <div class="message-system compaction-block">
          <div class="compaction-title">
            <span class="icon">📦</span>
            <strong>上下文压缩边界</strong>
            <span class="badge badge-compaction">压缩了 ~${comp.tokensBefore} Tokens</span>
          </div>
          <div class="compaction-summary">${escapeHtml(comp.summary)}</div>
        </div>
      `)
    }
  }

  // Todo 列表渲染
  let todosHtml = ""
  if (session.todos && session.todos.length > 0) {
    const items = session.todos
      .map((item) => {
        const check = item.status === "completed" ? "✅" : item.status === "in_progress" ? "⏳" : "⬜"
        const cls = item.status === "completed" ? "todo-completed" : ""
        return `<li class="${cls}"><span class="todo-icon">${check}</span> <span>${escapeHtml(item.content)}</span></li>`
      })
      .join("\n")

    todosHtml = `
      <div class="meta-card todos-card">
        <h3>📋 任务清单（快照）</h3>
        <ul class="todo-list">${items}</ul>
      </div>
    `
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - LX Agent 对话报告</title>
  <style>
    :root {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --border-color: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-blue: #38bdf8;
      --accent-emerald: #34d399;
      --accent-amber: #fbbf24;
      --accent-rose: #fb7185;
      --accent-violet: #a78bfa;
      --code-bg: #090d16;
      --user-bg: #1e293b;
      --assistant-bg: #131d31;
    }

    @media (prefers-color-scheme: light) {
      :root[data-theme="system"], :root[data-theme="light"] {
        --bg-primary: #f8fafc;
        --bg-secondary: #f1f5f9;
        --bg-card: #ffffff;
        --bg-hover: #e2e8f0;
        --border-color: #e2e8f0;
        --text-primary: #0f172a;
        --text-secondary: #475569;
        --text-muted: #94a3b8;
        --accent-blue: #0284c7;
        --accent-emerald: #059669;
        --accent-amber: #d97706;
        --accent-rose: #e11d48;
        --accent-violet: #7c3aed;
        --code-bg: #f8fafc;
        --user-bg: #f8fafc;
        --assistant-bg: #ffffff;
      }
    }

    :root[data-theme="dark"] {
      --bg-primary: #0f172a;
      --bg-secondary: #1e293b;
      --bg-card: #1e293b;
      --bg-hover: #334155;
      --border-color: #334155;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --accent-blue: #38bdf8;
      --accent-emerald: #34d399;
      --accent-amber: #fbbf24;
      --accent-rose: #fb7185;
      --accent-violet: #a78bfa;
      --code-bg: #090d16;
      --user-bg: #1e293b;
      --assistant-bg: #131d31;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.6;
      padding: 24px 16px;
    }

    .container {
      max-width: 960px;
      margin: 0 auto;
    }

    /* 顶部导航与元信息 */
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border-color);
    }
    .header-title h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 6px;
    }
    .header-meta {
      font-size: 13px;
      color: var(--text-secondary);
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }
    .toolbar {
      display: flex;
      gap: 8px;
    }
    .btn {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .btn:hover {
      background: var(--bg-hover);
    }

    /* 统计卡片面板 */
    .stats-panel {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      padding: 12px 16px;
      border-radius: 8px;
    }
    .stat-card .label {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .stat-card .value {
      font-size: 18px;
      font-weight: 600;
      color: var(--accent-blue);
    }

    /* 任务清单卡片 */
    .todos-card {
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .todos-card h3 {
      font-size: 15px;
      margin-bottom: 10px;
      color: var(--accent-emerald);
    }
    .todo-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .todo-list li {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    .todo-completed {
      text-decoration: line-through;
      opacity: 0.6;
    }

    /* 消息流 */
    .chat-stream {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .message {
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow: hidden;
    }
    .user-message {
      background: var(--user-bg);
      border-color: rgba(56, 189, 248, 0.2);
    }
    .assistant-message {
      background: var(--assistant-bg);
    }
    .message-header {
      padding: 10px 16px;
      background: rgba(0, 0, 0, 0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      border-bottom: 1px solid var(--border-color);
    }
    .user-meta, .assistant-meta {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .avatar { font-size: 16px; }
    .sender-name { font-weight: 600; }
    .message-time { color: var(--text-muted); font-size: 12px; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .token-info { font-size: 11px; color: var(--text-muted); }

    .message-body {
      padding: 16px;
      font-size: 14px;
    }

    /* 微标签 */
    .badge {
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 500;
    }
    .badge-steer { background: rgba(251, 191, 36, 0.15); color: var(--accent-amber); border: 1px solid rgba(251, 191, 36, 0.3); }
    .badge-cmd { background: rgba(167, 139, 250, 0.15); color: var(--accent-violet); border: 1px solid rgba(167, 139, 250, 0.3); }
    .badge-model { background: rgba(56, 189, 248, 0.15); color: var(--accent-blue); border: 1px solid rgba(56, 189, 248, 0.3); }
    .badge-compaction { background: rgba(52, 211, 153, 0.15); color: var(--accent-emerald); border: 1px solid rgba(52, 211, 153, 0.3); }

    /* 折叠块 Accordion */
    .accordion {
      margin: 10px 0;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--bg-card);
      overflow: hidden;
    }
    .accordion summary {
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      user-select: none;
      background: rgba(0, 0, 0, 0.05);
      outline: none;
    }
    .accordion summary:hover {
      background: var(--bg-hover);
    }
    .accordion-content {
      padding: 12px;
      border-top: 1px solid var(--border-color);
    }
    .thinking-content {
      font-size: 13px;
      color: var(--text-secondary);
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
    }

    /* 工具调用块 */
    .tool-summary-header {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .tool-name { font-weight: 600; font-family: monospace; }
    .tool-badge { font-size: 11px; padding: 2px 6px; border-radius: 4px; }
    .tool-status-success { background: rgba(52, 211, 153, 0.15); color: var(--accent-emerald); }
    .tool-status-error { background: rgba(251, 113, 133, 0.15); color: var(--accent-rose); }
    .tool-section { margin-bottom: 10px; }
    .tool-section-title { font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 4px; }

    /* 代码块与 Diff */
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 10px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.45;
    }
    code {
      font-family: inherit;
    }
    .code-block-wrapper {
      margin: 12px 0;
      border-radius: 6px;
      overflow: hidden;
    }
    .code-header {
      background: #1e293b;
      padding: 4px 10px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #94a3b8;
      border: 1px solid var(--border-color);
      border-bottom: none;
    }
    .copy-btn {
      background: transparent;
      border: 1px solid #475569;
      color: #cbd5e1;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .copy-btn:hover { background: #334155; }

    /* Diff 视图 */
    .diff-viewer { margin-top: 10px; }
    .diff-header { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 4px; }
    .diff-add { color: #4ade80; display: block; }
    .diff-del { color: #f87171; display: block; }
    .diff-ctx { color: var(--text-muted); display: block; }

    /* 压缩通知 */
    .compaction-block {
      background: rgba(52, 211, 153, 0.05);
      border: 1px dashed rgba(52, 211, 153, 0.3);
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
    }
    .compaction-title { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .compaction-summary { color: var(--text-secondary); white-space: pre-wrap; font-size: 12px; }

    /* 响应式适配 */
    @media (max-width: 640px) {
      body { padding: 12px 8px; }
      .header-bar { flex-direction: column; gap: 12px; }
      .header-meta { flex-direction: column; gap: 4px; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="header-bar">
      <div class="header-title">
        <h1>${escapeHtml(title)}</h1>
        <div class="header-meta">
          <span>会话 ID: <code>${escapeHtml(sessionId)}</code></span>
          <span>时间: ${formatTimestamp(createdAt)}</span>
          <span>工作目录: <code>${escapeHtml(cwd)}</code></span>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn" onclick="toggleAllTools()">切换所有工具展开</button>
        <button class="btn" onclick="toggleTheme()">🌓 切换主题</button>
      </div>
    </header>

    <section class="stats-panel">
      <div class="stat-card">
        <div class="label">用户消息</div>
        <div class="value">${userTurnCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">Agent 回复</div>
        <div class="value">${assistantTurnCount}</div>
      </div>
      <div class="stat-card">
        <div class="label">工具调用</div>
        <div class="value">${totalToolCalls}</div>
      </div>
      <div class="stat-card">
        <div class="label">总 Tokens 估算</div>
        <div class="value">${totalInputTokens + totalOutputTokens}</div>
      </div>
    </section>

    ${todosHtml}

    <main class="chat-stream">
      ${messagesHtml.join("\n")}
    </main>
  </div>

  <script>
    function copyCode(button) {
      const code = button.closest('.code-block-wrapper').querySelector('code').innerText;
      navigator.clipboard.writeText(code).then(() => {
        const originalText = button.innerText;
        button.innerText = '已复制!';
        setTimeout(() => { button.innerText = originalText; }, 1500);
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
