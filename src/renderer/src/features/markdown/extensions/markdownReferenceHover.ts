import { hoverTooltip } from "@codemirror/view"
import {
  getMarkdownReferenceImageSource,
  getMarkdownReferenceName,
  getMarkdownReferenceType,
} from "@/features/markdown/commands/markdownReferenceCommands"

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
