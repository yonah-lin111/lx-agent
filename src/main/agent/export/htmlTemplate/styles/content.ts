export const CONTENT_STYLES = `    /* 统计网格 */
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

`
