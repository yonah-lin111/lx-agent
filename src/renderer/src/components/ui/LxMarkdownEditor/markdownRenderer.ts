import MarkdownIt from "markdown-it"
import type { Options, Renderer, Token } from "markdown-it"

export const markdownRenderer = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true,
})

const defaultFenceRenderer = markdownRenderer.renderer.rules.fence

/**
 * 为代码块添加语言标签和供 React 挂载复制按钮的工具栏容器。
 */
markdownRenderer.renderer.rules.fence = (
  tokens: Token[],
  index: number,
  options: Options,
  environment: unknown,
  renderer: Renderer,
): string => {
  const token = tokens[index]
  const language = token.info.trim().split(/\s+/)[0] || "text"
  const renderedCode = defaultFenceRenderer
    ? defaultFenceRenderer(tokens, index, options, environment, renderer)
    : renderer.renderToken(tokens, index, options)

  return `<section class="markdown-code-block"><header class="markdown-code-block-header"><span class="markdown-code-language">${markdownRenderer.utils.escapeHtml(language)}</span><span class="markdown-code-copy"></span></header>${renderedCode}</section>`
}
