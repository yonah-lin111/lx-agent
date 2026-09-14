import type { Options, Token } from "markdown-it"
import MarkdownIt from "markdown-it"
import { highlightCode } from "@/lib/codeHighlight"

export const markdownRenderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

markdownRenderer.renderer.rules.task_checkbox = (tokens, idx) => {
  const token = tokens[idx]
  const checked = token.meta?.checked
  return `<input type="checkbox" class="task-list-item-checkbox" disabled${checked ? " checked" : ""}>`
}

// 打开中的围栏行（仅 ``` / ~~~ 本身的行）。
const FENCE_MARKER_RE = /^\s*(`{3,}|~{3,})\s*$/

// 围栏 token 是否为"尚未闭合"的最后一个代码块：结束行即输入末尾，且末行不是闭合标记。
const isUnclosedFenceToken = (token: Token, source: string): boolean => {
  const map = token.map
  if (!map) return false
  const lines = source.split("\n")
  // 去掉尾部换行产生的空元素，避免输入以 \n 结尾时误判。
  if (lines.at(-1) === "") lines.pop()
  if (map[1] !== lines.length) return false
  return !FENCE_MARKER_RE.test(lines.at(-1) ?? "")
}

// 为可滚动预览挂载的顶层块标注源码行，供编辑区与预览区同步滚动定位。
markdownRenderer.core.ruler.push("markdown-scroll-anchor", (state) => {
  const incrementalFenceHighlight = state.env?.incrementalFenceHighlight === true

  state.tokens.forEach((token) => {
    if (!token.map || token.level !== 0 || (token.nesting !== 1 && token.type !== "fence")) {
      return
    }

    token.attrSet("data-line", String(token.map[0]))

    // 流式渲染：标记尚未闭合的代码块，由 fence 规则跳过语法高亮（逐帧全量高亮是 O(n²) 开销）。
    if (
      incrementalFenceHighlight &&
      token.type === "fence" &&
      isUnclosedFenceToken(token, state.src)
    ) {
      token.meta = { ...(token.meta ?? {}), incompleteFence: true }
    }
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

  // 流式中尚未闭合的代码块走增量高亮（已完成行缓存复用，只逐帧高亮尾部）；闭合/结束后整块高亮。
  const renderedCode =
    token.meta?.incompleteFence === true
      ? renderStreamingFenceCode(token.content, language)
      : getCachedHighlight(token.content, language)

  return `<section class="markdown-code-block"${lineAttribute}><header class="markdown-code-block-header"><span class="markdown-code-language">${markdownRenderer.utils.escapeHtml(language)}</span><span class="markdown-code-actions"><span class="markdown-code-copy"></span><span class="markdown-code-collapse"></span></span></header><div class="markdown-code-content"><pre><code class="${options.langPrefix}${markdownRenderer.utils.escapeHtml(language)} hljs">${renderedCode}</code></pre>\n</div></section>`
}

// 高亮结果有界缓存：流式逐帧重渲染时，内容未变的已闭合代码块直接复用高亮 HTML。
const HIGHLIGHT_CACHE_LIMIT = 16
const highlightCache = new Map<string, string>()

// 已完成内容的语法高亮（带缓存；超大内容不入缓存，避免常驻内存膨胀）。
const getCachedHighlight = (content: string, language: string): string => {
  if (content.length > RENDER_CACHE_MAX_TEXT_LENGTH) return renderCode(content, language)
  const key = `${language}\u0000${content}`
  const cached = highlightCache.get(key)
  if (cached !== undefined) return cached
  const html = renderCode(content, language)
  highlightCache.set(key, html)
  if (highlightCache.size > HIGHLIGHT_CACHE_LIMIT) {
    const oldest = highlightCache.keys().next().value
    if (oldest !== undefined) highlightCache.delete(oldest)
  }
  return html
}

// 未闭合代码块的增量高亮缓存：按"语言 + 已完成行前缀"复用整块高亮结果，每帧只重高亮最后一行。
let streamingFenceCache: { language: string; prefix: string; html: string } | null = null

const renderStreamingFenceCode = (content: string, language: string): string => {
  const lastBreak = content.lastIndexOf("\n")
  const prefix = lastBreak >= 0 ? content.slice(0, lastBreak + 1) : ""
  const tail = lastBreak >= 0 ? content.slice(lastBreak + 1) : content

  let prefixHtml = ""
  if (prefix) {
    if (
      streamingFenceCache &&
      streamingFenceCache.language === language &&
      streamingFenceCache.prefix === prefix
    ) {
      prefixHtml = streamingFenceCache.html
    } else {
      prefixHtml = renderCode(prefix, language)
      streamingFenceCache = { language, prefix, html: prefixHtml }
    }
  }

  return tail ? `${prefixHtml}${renderCode(tail, language)}` : prefixHtml
}

// 渲染结果缓存：流式条目每帧整体重渲染时，已稳定的文本块直接复用 HTML（不再重复解析与高亮）。
// 有界缓存，超大文本不进入缓存以避免常驻内存膨胀。
const RENDER_CACHE_LIMIT = 32
const RENDER_CACHE_MAX_TEXT_LENGTH = 64 * 1024
const renderCache = new Map<string, string>()

/**
 * 渲染 Markdown。streaming=true 时对尚未闭合的代码块走增量高亮：
 * 已完成行的高亮结果整块缓存复用，每帧只重新高亮尾部（正在增长的最后一行），
 * 在保留语法着色的同时消除逐帧全量高亮的 O(n²) 开销；
 * 相同输入（文本 + streaming 标志）复用缓存结果，避免同一内容的重复解析。
 */
export const renderMarkdown = (text: string, options?: { streaming?: boolean }): string => {
  const streaming = options?.streaming === true
  if (text.length > RENDER_CACHE_MAX_TEXT_LENGTH) {
    return markdownRenderer.render(text, streaming ? { incrementalFenceHighlight: true } : {})
  }
  const key = `${streaming ? "1" : "0"}\u0000${text}`
  const cached = renderCache.get(key)
  if (cached !== undefined) return cached
  const html = markdownRenderer.render(text, streaming ? { incrementalFenceHighlight: true } : {})
  renderCache.set(key, html)
  if (renderCache.size > RENDER_CACHE_LIMIT) {
    const oldest = renderCache.keys().next().value
    if (oldest !== undefined) renderCache.delete(oldest)
  }
  return html
}
