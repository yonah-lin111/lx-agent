// 允许渲染的标签白名单（静态 SVG 元素与完整 HTML 前端原型/排版标签）。
const ALLOWED_TAGS = new Set([
  // 文档基础标签
  "html",
  "head",
  "body",
  "meta",
  "title",
  "style",
  // SVG 绘图标签
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "symbol",
  "use",
  "desc",
  "foreignobject",
  // 基础 HTML 排版与语义结构标签
  "div",
  "span",
  "p",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "pre",
  "code",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "sub",
  "sup",
  "blockquote",
  "hr",
  "br",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "section",
  "article",
  "nav",
  "aside",
  "main",
  "header",
  "footer",
  "figure",
  "figcaption",
  "details",
  "summary",
  "dialog",
  "mark",
  "time",
  "kbd",
  "samp",
  "var",
  "abbr",
  // 前端原型与交互组件标签
  "button",
  "input",
  "select",
  "textarea",
  "option",
  "optgroup",
  "label",
  "fieldset",
  "legend",
  "form",
  "progress",
  "meter",
  "canvas",
  "img",
  "a",
])

// 必须严格移除的危险可执行标签（含其所有子节点）。
const DANGEROUS_TAGS = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
  "marquee",
  "portal",
])

// 允许的属性白名单。
const ALLOWED_ATTRS = new Set([
  "id",
  "class",
  "classname",
  "style",
  "title",
  "role",
  "tabindex",
  "dir",
  "lang",
  "hidden",
  "charset",
  "content",
  // 表单与原型控件属性
  "type",
  "name",
  "value",
  "placeholder",
  "disabled",
  "readonly",
  "checked",
  "selected",
  "rows",
  "cols",
  "min",
  "max",
  "step",
  "for",
  "autocomplete",
  "maxlength",
  "minlength",
  "pattern",
  "required",
  "multiple",
  "size",
  "open",
  "alt",
  "src",
  "href",
  "target",
  "rel",
  // SVG 专有属性
  "viewbox",
  "width",
  "height",
  "x",
  "y",
  "dx",
  "dy",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "x1",
  "y1",
  "x2",
  "y2",
  "d",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-opacity",
  "stroke-miterlimit",
  "transform",
  "transform-origin",
  "points",
  "text-anchor",
  "font-size",
  "font-family",
  "font-weight",
  "font-style",
  "letter-spacing",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientunits",
  "gradienttransform",
  "clippathunits",
  "clip-path",
  "mask",
  "patternunits",
  "patterncontentunits",
  "patterntransform",
  "marker-start",
  "marker-mid",
  "marker-end",
  "markerunits",
  "markerwidth",
  "markerheight",
  "refx",
  "refy",
  "orient",
  "preserveaspectratio",
  "xmlns",
  "version",
  "opacity",
  // HTML 表格与布局属性
  "colspan",
  "rowspan",
  "align",
  "valign",
  "border",
  "cellpadding",
  "cellspacing",
  "scope",
  "headers",
  "xlink:href",
])

/**
 * 净化 style 属性，剔除危险脚本表达式与外部 URL。
 */
export const sanitizeStyle = (styleValue: string): string => {
  if (!styleValue) return ""
  if (/(javascript:|expression|behavior|url\s*\()/i.test(styleValue)) {
    return ""
  }
  return styleValue
}

/**
 * 深度递归净化 DOM 节点树。
 */
export const sanitizeNode = (node: Node): void => {
  const children = Array.from(node.childNodes)
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as HTMLElement
      const tagName = element.tagName.toLowerCase()

      // 危险节点直接整树移除。
      if (DANGEROUS_TAGS.has(tagName)) {
        element.remove()
        continue
      }

      // 未知节点保留子文本并展开（unwrap）。
      if (!ALLOWED_TAGS.has(tagName)) {
        sanitizeNode(element)
        while (element.firstChild) {
          element.parentNode?.insertBefore(element.firstChild, element)
        }
        element.remove()
        continue
      }

      // 净化 style 标签内部 CSS 规则。
      if (tagName === "style") {
        const cssContent = element.textContent || ""
        if (/(javascript:|expression|behavior|@import|url\s*\()/i.test(cssContent)) {
          element.remove()
          continue
        }
      }

      // 属性白名单与安全校验。
      const attrs = Array.from(element.attributes)
      for (const attr of attrs) {
        const attrName = attr.name.toLowerCase()
        const attrValue = attr.value.trim()

        // 移除所有 on* 事件处理器与未在白名单中的属性。
        if (
          attrName.startsWith("on") ||
          (!ALLOWED_ATTRS.has(attrName) &&
            !attrName.startsWith("aria-") &&
            !attrName.startsWith("data-"))
        ) {
          element.removeAttribute(attr.name)
          continue
        }

        // 严格限制 href、xlink:href 与 src 剔除 javascript: 伪协议。
        if (attrName === "href" || attrName === "xlink:href" || attrName === "src") {
          if (/^\s*javascript:/i.test(attrValue)) {
            element.removeAttribute(attr.name)
            continue
          }
        }

        // 净化内联样式。
        if (attrName === "style") {
          const safeStyle = sanitizeStyle(attrValue)
          if (safeStyle) {
            element.setAttribute(attr.name, safeStyle)
          } else {
            element.removeAttribute(attr.name)
          }
        }
      }

      // 递归净化合法子节点。
      sanitizeNode(element)
    }
  }
}

/**
 * 净化 SVG 或简单 HTML 片段字符串。
 */
export const sanitizeGraphicContent = (rawContent: string): string => {
  if (!rawContent || typeof rawContent !== "string") return ""
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawContent, "text/html")
    sanitizeNode(doc.body)
    return doc.body.innerHTML
  } catch {
    return ""
  }
}

/**
 * 净化完整 HTML 文档并注入基准样式，输出完整独立的沙箱 HTML 源码。
 */
export const sanitizeHtmlDocument = (rawContent: string, customStyle?: string): string => {
  if (!rawContent || typeof rawContent !== "string") return ""
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawContent, "text/html")

    // 净化 head 与 body
    if (doc.head) sanitizeNode(doc.head)
    if (doc.body) sanitizeNode(doc.body)

    // 若有传入自定义 style，作为最后一项注入 head
    if (customStyle && doc.head) {
      const userStyle = doc.createElement("style")
      userStyle.textContent = customStyle
      sanitizeNode(userStyle)
      doc.head.appendChild(userStyle)
    }

    return `<!DOCTYPE html><html><head>${doc.head?.innerHTML || ""}</head><body>${doc.body?.innerHTML || ""}</body></html>`
  } catch {
    return rawContent
  }
}
