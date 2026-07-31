import hljs from "highlight.js/lib/core"
import bash from "highlight.js/lib/languages/bash"
import c from "highlight.js/lib/languages/c"
import cpp from "highlight.js/lib/languages/cpp"
import csharp from "highlight.js/lib/languages/csharp"
import css from "highlight.js/lib/languages/css"
import go from "highlight.js/lib/languages/go"
import java from "highlight.js/lib/languages/java"
import javascript from "highlight.js/lib/languages/javascript"
import json from "highlight.js/lib/languages/json"
import markdown from "highlight.js/lib/languages/markdown"
import php from "highlight.js/lib/languages/php"
import python from "highlight.js/lib/languages/python"
import rust from "highlight.js/lib/languages/rust"
import sql from "highlight.js/lib/languages/sql"
import typescript from "highlight.js/lib/languages/typescript"
import xml from "highlight.js/lib/languages/xml"
import yaml from "highlight.js/lib/languages/yaml"
import type { Options, Token } from "markdown-it"
import MarkdownIt from "markdown-it"
import {
  getMarkdownReferenceIconSvg,
  getMarkdownReferenceLabel,
  getMarkdownReferenceName,
  getMarkdownReferenceProjectPaths,
  getMarkdownReferenceType,
} from "@/components/ui/LxMarkdown/commands/markdownReferenceCommands"
import { getFileMentionDisplayLabel } from "@/components/ui/LxMarkdown/extensions/markdownFileMentions"

const languageAliases: Record<string, string> = {
  cs: "csharp",
  cxx: "cpp",
  htm: "xml",
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
}

hljs.registerLanguage("bash", bash)
hljs.registerLanguage("c", c)
hljs.registerLanguage("cpp", cpp)
hljs.registerLanguage("csharp", csharp)
hljs.registerLanguage("css", css)
hljs.registerLanguage("go", go)
hljs.registerLanguage("java", java)
hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("json", json)
hljs.registerLanguage("markdown", markdown)
hljs.registerLanguage("php", php)
hljs.registerLanguage("python", python)
hljs.registerLanguage("rust", rust)
hljs.registerLanguage("sql", sql)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("yaml", yaml)

export const markdownRenderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

interface MarkdownBlockState {
  env?: { disableTemplateBlocks?: boolean }
  src: string
  bMarks: number[]
  tShift: number[]
  eMarks: number[]
  blkIndent: number
  line: number
  getLines: (begin: number, end: number, indent: number, keepLastLF: boolean) => string
  push: (type: string, tag: string, nesting: number) => Token
}

const markdownTemplateCommands = new Set([
  "addTemplate",
  "bugTemplate",
  "refactorTemplate",
  "commonTemplate",
])

const markdownTemplateBlock = (
  state: MarkdownBlockState,
  startLine: number,
  endLine: number,
  silent: boolean,
): boolean => {
  if (state.env?.disableTemplateBlocks) return false

  const startText = state.src.slice(
    state.bMarks[startLine] + state.tShift[startLine],
    state.eMarks[startLine],
  )
  const startMatch = /^&&&\s+([A-Za-z]\w*)\s*$/.exec(startText)
  if (!startMatch || !markdownTemplateCommands.has(startMatch[1])) return false

  let closeLine = startLine + 1
  while (closeLine < endLine) {
    const lineText = state.src.slice(
      state.bMarks[closeLine] + state.tShift[closeLine],
      state.eMarks[closeLine],
    )
    if (/^&&&\s*$/.test(lineText)) break
    closeLine += 1
  }
  if (closeLine >= endLine) return false
  if (silent) return true

  const token = state.push("markdown_template", "", 0)
  token.block = true
  token.map = [startLine, closeLine + 1]
  token.meta = {
    command: startMatch[1],
    content: state.getLines(startLine + 1, closeLine, state.blkIndent, true),
  }
  state.line = closeLine + 1
  return true
}

markdownRenderer.block.ruler.before("fence", "markdown_template", markdownTemplateBlock, {
  alt: ["paragraph", "reference", "blockquote", "list"],
})

markdownRenderer.inline.ruler.before("link", "markdown-reference", (state, silent) => {
  const match = /^@\[(refer-[a-z]+)\]\(([^)\r\n]+)\)/.exec(state.src.slice(state.pos))
  const type = match ? getMarkdownReferenceType(match[1] ?? "") : null
  if (!match || !type) return false

  if (!silent) {
    const token = state.push("markdown_reference", "", 0)
    token.meta = { path: match[2], type }
  }

  state.pos += match[0].length
  return true
})

markdownRenderer.renderer.rules.markdown_reference = (tokens, index) => {
  const reference = tokens[index]?.meta as { path: string; type: string }
  const type = getMarkdownReferenceType(reference.type)
  if (!type) return ""

  const path = markdownRenderer.utils.escapeHtml(reference.path)
  const label = markdownRenderer.utils.escapeHtml(getMarkdownReferenceLabel(type))
  const name = markdownRenderer.utils.escapeHtml(getMarkdownReferenceName(reference.path))
  const iconSvg = getMarkdownReferenceIconSvg(type)

  return `<span class="markdown-reference markdown-reference-${type}" data-reference-path="${path}"><span class="markdown-reference-icon">${iconSvg}</span><span class="markdown-reference-label">${label}</span><span class="markdown-reference-name">${name}</span></span>`
}

markdownRenderer.inline.ruler.after(
  "markdown-reference",
  "markdown-file-mention",
  (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x40 /* @ */) return false
    if (state.pos > 0 && /\w/.test(state.src[state.pos - 1])) return false

    const match = /^@([^\s\[\]\(\)]+)/.exec(state.src.slice(state.pos))
    if (!match) return false

    let rawMention = match[0]
    let rawPath = match[1]

    const trailingPunctuationMatch = /([.,;:!?]+)$/.exec(rawPath)
    if (trailingPunctuationMatch) {
      const punctLen = trailingPunctuationMatch[1].length
      rawMention = rawMention.slice(0, -punctLen)
      rawPath = rawPath.slice(0, -punctLen)
    }
    if (!rawPath) return false

    if (!silent) {
      const token = state.push("markdown_file_mention", "", 0)
      token.meta = { mention: rawMention, path: rawPath }
    }

    state.pos += rawMention.length
    return true
  },
)

markdownRenderer.renderer.rules.markdown_file_mention = (tokens, index, _options, env) => {
  const meta = tokens[index]?.meta as { mention: string; path: string }
  if (!meta) return ""

  const fullMention = meta.mention.startsWith("@") ? meta.mention : `@${meta.mention}`
  const encodedMention = encodeURIComponent(fullMention)
  const referencedProjectNames = env?.referencedProjectNames as Set<string> | undefined
  const displayLabel = getFileMentionDisplayLabel(meta.path, referencedProjectNames)
  const encodedDisplayLabel = encodeURIComponent(displayLabel)
  const escapedDisplayLabel = markdownRenderer.utils.escapeHtml(displayLabel)

  const firstPart = meta.path
    .replace(/^@/, "")
    .split(/[/\\]+/)
    .filter(Boolean)[0]
  const isReferenced = Boolean(firstPart && referencedProjectNames?.has(firstPart))

  return `<span class="markdown-file-mention" data-full-mention="${encodedMention}" data-display-label="${encodedDisplayLabel}" data-is-referenced="${isReferenced ? "true" : "false"}"><span class="markdown-file-mention-node ${isReferenced ? "markdown-file-mention-node--referenced" : ""}">${escapedDisplayLabel}</span></span>`
}

markdownRenderer.renderer.rules.task_checkbox = (tokens, idx) => {
  const token = tokens[idx]
  const checked = token.meta?.checked
  return `<input type="checkbox" class="task-list-item-checkbox" disabled${checked ? " checked" : ""}>`
}

markdownRenderer.core.ruler.push("markdown-referenced-projects", (state) => {
  const projectPaths = getMarkdownReferenceProjectPaths(state.src)
  const projectNames = new Set(projectPaths.map(getMarkdownReferenceName))
  state.env = state.env || {}
  state.env.referencedProjectNames = projectNames
  return true
})

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
const renderCode = (content: string, language: string): string => {
  const normalizedLanguage = languageAliases[language.toLowerCase()] ?? language.toLowerCase()

  if (!hljs.getLanguage(normalizedLanguage)) {
    return markdownRenderer.utils.escapeHtml(content)
  }

  return hljs.highlight(content, { language: normalizedLanguage, ignoreIllegals: true }).value
}

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

/**
 * 渲染模板块；内部 Markdown 禁止再次解析模板块。
 */
markdownRenderer.renderer.rules.markdown_template = (tokens, index) => {
  const meta = tokens[index]?.meta as { command: string; content: string }
  const command = markdownRenderer.utils.escapeHtml(meta.command)
  const encodedContent = encodeURIComponent(meta.content)
  const contentHtml = markdownRenderer.render(meta.content, { disableTemplateBlocks: true })

  return `<section class="markdown-template-block" data-template-command="${command}" data-template-content="${encodedContent}"><header class="markdown-template-block-header"><span class="markdown-template-command">${command}</span><span class="markdown-template-actions"><span class="markdown-template-copy"></span><span class="markdown-template-collapse"></span></span></header><div class="markdown-template-content">${contentHtml}</div></section>`
}
