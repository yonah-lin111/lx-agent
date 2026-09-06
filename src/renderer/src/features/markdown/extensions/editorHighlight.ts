import { HighlightStyle } from "@codemirror/language"
import { hoverTooltip } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import {
  getMarkdownReferenceImageSource,
  getMarkdownReferenceName,
  getMarkdownReferenceType,
} from "@/features/markdown/commands/markdownReferenceCommands"

// Markdown 语法高亮配色定义。
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#e9a339", fontWeight: "700" },
  { tag: tags.heading1, color: "#e9a339", fontSize: "1.5em" },
  { tag: tags.heading2, color: "#e9a339", fontSize: "1.3em" },
  { tag: tags.heading3, color: "#e9a339", fontSize: "1.15em" },
  { tag: tags.heading4, color: "#e9a339", fontSize: "1.08em" },
  { tag: tags.heading5, color: "#e9a339", fontSize: "1.03em" },
  { tag: tags.heading6, color: "#e9a339", fontSize: "1.0em" },
  { tag: tags.emphasis, color: "#fcd34d", fontStyle: "italic" },
  { tag: tags.strong, color: "#f59e0b", fontWeight: "700" },
  { tag: tags.strikethrough, color: "#fda4af", textDecoration: "line-through" },
  { tag: tags.link, color: "#93c5fd", textDecoration: "underline" },
  { tag: tags.url, color: "#67e8f9" },
  { tag: tags.quote, color: "#c4b5fd", fontStyle: "italic" },
  {
    tag: tags.monospace,
    color: "#fca5a5",
    backgroundColor: "rgba(252, 165, 165, 0.12)",
    borderRadius: "3px",
    padding: "1px 4px",
  },
  { tag: [tags.meta, tags.processingInstruction], color: "#7dd3fc" },
  { tag: tags.keyword, color: "#c4b5fd" },
  { tag: tags.string, color: "#86efac" },
  { tag: tags.number, color: "#fda4af" },
  { tag: tags.comment, color: "#94a3b8", fontStyle: "italic" },
  { tag: tags.variableName, color: "#e2e8f0" },
  { tag: tags.typeName, color: "#67e8f9" },
  { tag: tags.propertyName, color: "#93c5fd" },
  { tag: tags.operator, color: "#fcd34d" },
])

// 引用语法模式：@[refer-type](path)
export const MARKDOWN_REFERENCE_PATTERN = /@\[(refer-[a-z]+)\]\(((?:[^()\r\n]|\([^()\r\n]*\))+)\)/g

/**
 * 构建引用图片 hover tooltip 的 DOM：仅图片预览。
 * 图片加载完成后触发 onSizeChange，让 CodeMirror 重新测量定位。
 */
const buildMarkdownReferenceImageTooltipDom = (
  path: string,
  onSizeChange?: () => void,
): HTMLElement => {
  const wrap = document.createElement("div")
  wrap.className = "w-fit min-w-40 max-w-[min(30rem,calc(100vw-1rem))]"

  const img = document.createElement("img")
  img.alt = getMarkdownReferenceName(path)
  img.className = "mx-auto block h-auto max-h-90 max-w-full rounded-[4px] object-contain"
  img.src = getMarkdownReferenceImageSource(path)
  img.onload = () => onSizeChange?.()
  img.onerror = () => {
    onSizeChange?.()
    wrap.replaceChildren()
    const fallback = document.createElement("span")
    fallback.className = "whitespace-nowrap"
    fallback.textContent = "图片加载失败"
    wrap.appendChild(fallback)
  }
  wrap.appendChild(img)
  return wrap
}

/**
 * 编辑器内 hover 引用图片时显示图片预览 tooltip，不影响文本渲染。
 * 方向在 hover 时按触发位置一次性确定并固定（strictSide），
 * 避免图片加载后高度变化触发 CodeMirror 自动翻转导致浮层上下跳转；
 * 图片加载完成后请求重测，使浮层贴合图片真实尺寸。
 */
export const markdownReferenceHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos)
  const relative = pos - line.from

  MARKDOWN_REFERENCE_PATTERN.lastIndex = 0
  for (const match of line.text.matchAll(MARKDOWN_REFERENCE_PATTERN)) {
    if (match.index === undefined) continue
    const start = match.index
    const end = start + match[0].length
    if (relative < start || relative >= end) continue

    const type = getMarkdownReferenceType(match[1] ?? "")
    if (type !== "image") return null

    const from = line.from + start
    const coords = view.coordsAtPos(pos)
    const editorRect = view.dom.getBoundingClientRect()
    const above = coords ? coords.top - editorRect.top > editorRect.height / 2 : true
    return {
      pos: from,
      end: line.from + end,
      above,
      strictSide: true,
      create: () => ({
        dom: buildMarkdownReferenceImageTooltipDom(match[2] ?? "", () => view.requestMeasure()),
      }),
    }
  }
  return null
})
