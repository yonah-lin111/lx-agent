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
  if (Number.isNaN(date.getTime())) return escapeHtml(String(ts))
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

  // 转义常规 HTML（先转义再生成行内代码标签，避免 <code> 标签被二次转义）
  text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  // 行内代码（内容已转义，直接包裹）
  text = text.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)

  // 恢复代码块占位符：函数形式避免 $& 等替换语义，单次扫描避免重扫已插入内容
  text = text.replace(
    /__CODE_BLOCK_(\d+)__/g,
    (_match, idx: string) => codeBlocks[Number(idx)] ?? "",
  )

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
