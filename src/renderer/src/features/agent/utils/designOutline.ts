// 设计结构大纲：为模型生成可直接用于 <front_design_update target="..."> 的稳定 CSS 选择器清单。
// 选择器全部基于 `body > tag:nth-child(n)` 路径推导，与注入的基线 HTML 严格同源，宿主保证可命中。

const EXCLUDED_TAGS = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "meta",
  "link",
  "title",
  "head",
  "svg",
  "path",
  "defs",
  "symbol",
  "use",
  "iframe",
  "br",
  "hr",
  "col",
  "colgroup",
])

// 内容叶子标签：列出自身但不再下钻，避免大纲被图标/文本碎片淹没。
const LEAF_TAGS = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "span",
  "a",
  "button",
  "img",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "code",
  "pre",
  "kbd",
  "strong",
  "em",
  "small",
  "b",
  "i",
  "u",
  "s",
  "time",
  "summary",
  "td",
  "th",
  "li",
])

const DEFAULT_MAX_DEPTH = 4
const DEFAULT_MAX_ENTRIES = 40
const MAX_TEXT_PREVIEW = 48

const normalizeText = (value: string): string => value.replace(/\s+/g, " ").trim()

const describeElement = (element: Element): string => {
  const tag = element.tagName.toLowerCase()
  const id = element.id.trim()
  if (id) return `${tag}#${id}`
  const firstClass = (element.getAttribute("class") || "").split(/\s+/).filter(Boolean)[0]
  return firstClass ? `${tag}.${firstClass}` : tag
}

export interface DesignOutlineOptions {
  maxDepth?: number
  maxEntries?: number
}

/**
 * 从设计 HTML 生成缩进结构大纲，每行形如：
 * `- body > div:nth-child(1) > details:nth-child(3) — details.group "折叠标题 …"`
 * 无可用结构时返回空字符串。
 */
export const buildDesignOutline = (html: string, options?: DesignOutlineOptions): string => {
  if (!html || typeof html !== "string") return ""
  if (typeof window === "undefined" || !window.DOMParser) return ""

  const maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES

  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const body = doc.body
    if (!body) return ""

    const lines: string[] = []

    const walk = (parent: Element, parentSelector: string, depth: number): void => {
      if (depth > maxDepth) return
      const children = Array.from(parent.children)
      for (let index = 0; index < children.length; index += 1) {
        if (lines.length >= maxEntries) return
        const child = children[index]
        const tag = child.tagName.toLowerCase()
        if (EXCLUDED_TAGS.has(tag)) continue

        const selector = `${parentSelector} > ${tag}:nth-child(${index + 1})`
        const preview = normalizeText(child.textContent || "").slice(0, MAX_TEXT_PREVIEW)
        lines.push(
          `${"  ".repeat(depth - 1)}- ${selector} — ${describeElement(child)}${preview ? ` "${preview}"` : ""}`,
        )

        if (!LEAF_TAGS.has(tag)) {
          walk(child, selector, depth + 1)
        }
      }
    }

    walk(body, "body", 1)
    return lines.join("\n")
  } catch {
    return ""
  }
}
