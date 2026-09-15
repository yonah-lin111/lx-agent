export const TOOL_STYLES = `    /* 代码块与复制 */
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
`
