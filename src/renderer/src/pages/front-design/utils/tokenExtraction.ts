// 设计令牌提取：扫描画布计算样式，统计高频颜色 / 圆角 / 字体（只读 DOM，纯函数）。

import type { ExtractedDesignTokens } from "@/pages/front-design/types"
import { formatHexColor, parseColor } from "@/pages/front-design/utils/contrast"
import { isZeroLength } from "@/pages/front-design/utils/elementStyles"

// 扫描上限与色板容量。
const MAX_SCANNED_ELEMENTS = 2000
const MAX_EXTRACTED_COLORS = 8

// 不参与统计的标签与注入容器（沙箱守卫 / 错误守卫 / 批注图层）。
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE"])
const INJECTED_CONTAINER_SELECTOR = '[id^="lx-"]'

// 浏览器默认衬线字体与通用族不视为设计指定字体。
const DEFAULT_FONT_FAMILIES = new Set([
  "times new roman",
  "times",
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "ui-rounded",
])

export interface ExtractDesignTokensOptions {
  maxColors?: number
  maxElements?: number
}

// 频次统计：并列时保持首次出现顺序。
const sortByFrequency = (counts: Map<string, number>): string[] =>
  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)

const increment = (counts: Map<string, number>, value: string): void => {
  counts.set(value, (counts.get(value) ?? 0) + 1)
}

// 只收不透明色并归一化为 hex；半透明与透明返回 null。
const normalizeOpaqueColor = (value: string): string | null => {
  const parsed = parseColor(value)
  if (!parsed || parsed.a < 1) return null
  return formatHexColor(parsed)
}

// 字体栈首项，去除引号；默认字体族返回 null。
const normalizeFontFamily = (value: string): string | null => {
  const first = value
    .split(",")[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, "")
  if (!first || DEFAULT_FONT_FAMILIES.has(first.toLowerCase())) return null
  return first
}

/**
 * 提取设计令牌：颜色按 `color / background-color / border-top-color`（边框宽度 > 0）频次统计；
 * 圆角取最高频非零值；字体取 body 计算字体栈首项（默认字体族不出）。
 */
export const extractDesignTokens = (
  doc: Document | null | undefined,
  options: ExtractDesignTokensOptions = {},
): ExtractedDesignTokens => {
  const empty: ExtractedDesignTokens = { colors: [], radius: null, fontFamily: null }
  const body = doc?.body
  const view = doc?.defaultView
  if (!doc || !body || !view?.getComputedStyle) return empty

  const maxColors = options.maxColors ?? MAX_EXTRACTED_COLORS
  const maxElements = options.maxElements ?? MAX_SCANNED_ELEMENTS
  const colorCounts = new Map<string, number>()
  const radiusCounts = new Map<string, number>()

  // 计算样式按元素缓存：父级比对复用同一份结果。
  const styleCache = new Map<Element, CSSStyleDeclaration | null>()
  const readStyle = (element: Element): CSSStyleDeclaration | null => {
    if (styleCache.has(element)) return styleCache.get(element) ?? null
    let style: CSSStyleDeclaration | null = null
    try {
      style = view.getComputedStyle(element)
    } catch {
      style = null
    }
    styleCache.set(element, style)
    return style
  }

  const elements = Array.from(body.querySelectorAll("*")).slice(0, maxElements)
  for (const element of elements) {
    if (SKIP_TAGS.has(element.tagName)) continue
    if (element.closest(INJECTED_CONTAINER_SELECTOR)) continue

    const style = readStyle(element)
    if (!style) continue

    // 文字色只在「本元素显式指定」时统计：与父级计算值相同视为继承，不计入。
    const parentStyle = element.parentElement ? readStyle(element.parentElement) : null
    const color = normalizeOpaqueColor(style.color)
    if (color && (!parentStyle || parentStyle.color !== style.color)) {
      increment(colorCounts, color)
    }

    // 背景色不继承，非透明即视为本元素用色。
    const background = normalizeOpaqueColor(style.backgroundColor)
    if (background) increment(colorCounts, background)

    // 无边框宽度时边框色无意义。
    if (!isZeroLength(style.borderTopWidth) && style.borderTopStyle !== "none") {
      const borderColor = normalizeOpaqueColor(style.borderTopColor)
      if (borderColor) increment(colorCounts, borderColor)
    }

    // 部分环境不展开 border-radius shorthand：逐角为零时回退整体值。
    const longhandRadius = style.borderTopLeftRadius
    const radiusValue = isZeroLength(longhandRadius) ? style.borderRadius : longhandRadius
    if (!isZeroLength(radiusValue)) increment(radiusCounts, radiusValue)
  }

  return {
    colors: sortByFrequency(colorCounts).slice(0, maxColors),
    radius: sortByFrequency(radiusCounts)[0] ?? null,
    fontFamily: normalizeFontFamily(view.getComputedStyle(body).fontFamily),
  }
}
