import type { Options, Token } from "markdown-it"
import MarkdownIt from "markdown-it"
import { highlightCode } from "@/lib/codeHighlight"

export const markdownRenderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

markdownRenderer.inline.ruler.before("link", "markdown-memory-citation", (state, silent) => {
  if (
    state.src.charCodeAt(state.pos) !== 0x5b /* [ */ ||
    state.src.charCodeAt(state.pos + 1) !== 0x5e /* ^ */ ||
    state.src.slice(state.pos, state.pos + 6) !== "[^mem:"
  ) {
    return false
  }

  const match = /^\[\^mem:((?:[^\]\[]|\[[^\]]*\])+)\]/.exec(state.src.slice(state.pos))
  if (!match) return false

  const rawContent = match[1]
  if (!silent) {
    const token = state.push("markdown_memory_citation", "", 0)
    token.meta = { raw: rawContent }
  }

  state.pos += match[0].length
  return true
})

markdownRenderer.renderer.rules.markdown_memory_citation = (tokens, index) => {
  const meta = tokens[index]?.meta as { raw: string }
  if (!meta) return ""

  const raw = meta.raw.trim()
  const noteIndex = raw.lastIndexOf("|note=")
  let note: string | undefined
  let location = raw

  if (noteIndex !== -1) {
    let noteRaw = raw.slice(noteIndex + 6).trim()
    if (noteRaw.startsWith("[") && noteRaw.endsWith("]")) {
      noteRaw = noteRaw.slice(1, -1).trim()
    }
    note = noteRaw
    location = raw.slice(0, noteIndex).trim()
  }

  const colonIndex = location.lastIndexOf(":")
  let path = location
  let range = ""
  if (colonIndex !== -1) {
    path = location.slice(0, colonIndex).trim()
    range = location.slice(colonIndex + 1).trim()
  }

  const encodedPath = encodeURIComponent(path)
  const encodedRange = encodeURIComponent(range)
  const encodedNote = encodeURIComponent(note ?? "")
  const escapedPath = markdownRenderer.utils.escapeHtml(path)
  const escapedRange = markdownRenderer.utils.escapeHtml(range ? `:${range}` : "")

  return `<span class="markdown-memory-citation" data-memory-path="${encodedPath}" data-memory-range="${encodedRange}" data-memory-note="${encodedNote}"><span class="markdown-memory-citation-chip"><svg class="markdown-memory-citation-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg><span class="markdown-memory-citation-label">${escapedPath}${escapedRange}</span></span></span>`
}

markdownRenderer.renderer.rules.task_checkbox = (tokens, idx) => {
  const token = tokens[idx]
  const checked = token.meta?.checked
  return `<input type="checkbox" class="task-list-item-checkbox" disabled${checked ? " checked" : ""}>`
}

// 为可滚动预览挂载的顶层块标注源码行，供编辑区与预览区同步滚动定位。
markdownRenderer.core.ruler.push("markdown-scroll-anchor", (state) => {
  state.tokens.forEach((token) => {
    if (!token.map || token.level !== 0 || (token.nesting !== 1 && token.type !== "fence")) {
      return
    }

    token.attrSet("data-line", String(token.map[0]))
  })

  return true
})

markdownRenderer.core.ruler.push("markdown-task-lists", (state) => {
  const tokens = state.tokens
  let currentListItem: Token | null = null

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]

    if (token.type === "list_item_open") {
      currentListItem = token
    } else if (token.type === "list_item_close") {
      currentListItem = null
    } else if (token.type === "inline" && currentListItem) {
      const match = token.content.match(/^\[([ xX])\]\s*(.*)/)
      if (match) {
        const checked = match[1].toLowerCase() === "x"
        currentListItem.attrSet("class", "task-list-item")

        token.content = match[2]

        if (token.children && token.children.length > 0) {
          const firstChild = token.children[0]
          if (firstChild.type === "text") {
            firstChild.content = firstChild.content.replace(/^\[[ xX]\]\s*/, "")
          }
        }

        const checkboxToken = new state.Token("task_checkbox", "", 0)
        checkboxToken.meta = { checked }
        token.children = [checkboxToken, ...(token.children || [])]
      }
    }
  }

  return true
})

// 对已注册语言生成高亮 HTML，其他语言保留纯文本。
const renderCode = (content: string, language: string): string => highlightCode(content, language)

/**
 * 为代码块添加语言标签和供 React 挂载复制按钮的工具栏容器。
 */
markdownRenderer.renderer.rules.fence = (
  tokens: Token[],
  index: number,
  options: Options,
): string => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] || "text"
  const sourceLine = token.attrGet("data-line")
  const lineAttribute = sourceLine === null ? "" : ` data-line="${sourceLine}"`

  if (language.toLowerCase() === "mermaid") {
    const source = encodeURIComponent(token.content)

    return `<section class="markdown-mermaid" data-mermaid-source="${source}"${lineAttribute}></section>`
  }

  const renderedCode = `<pre><code class="${options.langPrefix}${markdownRenderer.utils.escapeHtml(language)} hljs">${renderCode(token.content, language)}</code></pre>\n`

  return `<section class="markdown-code-block"${lineAttribute}><header class="markdown-code-block-header"><span class="markdown-code-language">${markdownRenderer.utils.escapeHtml(language)}</span><span class="markdown-code-actions"><span class="markdown-code-copy"></span><span class="markdown-code-collapse"></span></span></header><div class="markdown-code-content">${renderedCode}</div></section>`
}
