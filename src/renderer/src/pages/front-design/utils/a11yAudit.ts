// 可用性审计：6 条零依赖 DOM 规则，产出可回流的发现清单。

import type { A11yFinding } from "@/pages/front-design/types"
import {
  compositeColor,
  contrastRatio,
  contrastThreshold,
  formatContrastRatio,
  parseColor,
  type RgbaColor,
} from "@/pages/front-design/utils/contrast"

// 单规则与总体截断上限，避免面板被同类问题淹没。
const MAX_PER_RULE = 5
const MAX_TOTAL = 20

// 最小点击区边长（WCAG 2.5.8）。
const MIN_TARGET_SIZE_PX = 24

const INTERACTIVE_SELECTOR = "a[href], button, input, select, textarea, [role=button]"
const NAME_TARGET_SELECTOR = "button, a[href], [role=button]"
const FORM_CONTROL_SELECTOR = "input, select, textarea"
// 预览自身注入的节点（守卫样式、批注图层等）不参与审计。
const INJECTED_SELECTOR = "[id^='lx-']"
const SKIPPED_INPUT_TYPES = new Set(["hidden", "submit", "button", "reset", "image"])
const SKIPPED_IMG_ROLES = new Set(["presentation", "none"])

// 元素尺寸。
export interface ElementMeasure {
  width: number
  height: number
}

export interface RunA11yAuditOptions {
  // 计算样式读取器，缺省取元素所属 window。
  getComputedStyle?: (element: Element) => CSSStyleDeclaration
  // 元素尺寸测量器，缺省用 getBoundingClientRect。
  measure?: (element: Element) => ElementMeasure
}

/**
 * 生成无变异路径选择器：`body>main>h1:nth-child(2)`。
 * 不向设计 DOM 注入任何属性，保证与落盘 HTML 同源可命中。
 */
export const buildElementPathSelector = (element: Element): string => {
  const document = element.ownerDocument
  if (!document) return ""

  const segments: string[] = []
  let current: Element | null = element
  while (current && current !== document.documentElement) {
    const tag = current.tagName.toLowerCase()
    const parent = current.parentElement
    if (!parent) return ""
    const index = Array.prototype.indexOf.call(parent.children, current) + 1
    segments.unshift(`${tag}:nth-child(${index})`)
    if (tag === "body") break
    current = parent
  }
  return segments.join(">")
}

const isInjectedNode = (element: Element): boolean => Boolean(element.closest(INJECTED_SELECTOR))

const hasDirectText = (element: Element): boolean =>
  Array.from(element.childNodes).some(
    (node) => node.nodeType === 3 && Boolean(node.textContent?.trim()),
  )

const isHidden = (style: CSSStyleDeclaration, size: ElementMeasure): boolean =>
  style.display === "none" ||
  style.visibility === "hidden" ||
  Number.parseFloat(style.opacity || "1") === 0 ||
  size.width <= 0 ||
  size.height <= 0

/**
 * 自上而下合成有效背景色：收集祖先链上的非透明背景，按由外到内叠加。
 */
const resolveBackground = (
  element: Element,
  getComputedStyle: (target: Element) => CSSStyleDeclaration,
): RgbaColor => {
  const layers: RgbaColor[] = []
  let current: Element | null = element
  while (current) {
    const color = parseColor(getComputedStyle(current).backgroundColor)
    if (color && color.a > 0) layers.push(color)
    current = current.parentElement
  }

  let background: RgbaColor = { r: 255, g: 255, b: 255, a: 1 }
  for (const layer of layers.reverse()) {
    background = compositeColor(layer, background)
  }
  return background.a < 1
    ? compositeColor(background, { r: 255, g: 255, b: 255, a: 1 })
    : background
}

// 规则 1：图片缺少 alt。
const auditAlt = (doc: Document): A11yFinding[] =>
  Array.from(doc.body.querySelectorAll("img"))
    .filter((element) => {
      if (isInjectedNode(element) || element.hasAttribute("alt")) return false
      const role = element.getAttribute("role")?.toLowerCase()
      return !role || !SKIPPED_IMG_ROLES.has(role)
    })
    .slice(0, MAX_PER_RULE)
    .map((element) => ({
      rule: "alt" as const,
      level: "warning" as const,
      selector: buildElementPathSelector(element),
    }))

// 规则 2：交互元素缺少可访问名称。
const hasAccessibleName = (element: Element): boolean => {
  if (element.getAttribute("aria-label")?.trim()) return true
  if (element.getAttribute("aria-labelledby")?.trim()) return true
  if (element.getAttribute("title")?.trim()) return true
  if (element.textContent?.trim()) return true
  if (element.getAttribute("value")?.trim()) return true

  return Array.from(element.querySelectorAll("img[alt]")).some((img) =>
    Boolean(img.getAttribute("alt")?.trim()),
  )
}

const auditAccessibleName = (doc: Document): A11yFinding[] =>
  Array.from(doc.body.querySelectorAll(NAME_TARGET_SELECTOR))
    .filter((element) => !isInjectedNode(element) && !hasAccessibleName(element))
    .slice(0, MAX_PER_RULE)
    .map((element) => ({
      rule: "accessible-name" as const,
      level: "error" as const,
      selector: buildElementPathSelector(element),
    }))

// 规则 3：文本对比度不足。
const auditContrast = (doc: Document, options: Required<RunA11yAuditOptions>): A11yFinding[] => {
  const findings: A11yFinding[] = []
  const elements = Array.from(doc.body.querySelectorAll("*"))

  for (const element of elements) {
    if (findings.length >= MAX_PER_RULE) break
    if (isInjectedNode(element) || !hasDirectText(element)) continue

    const style = options.getComputedStyle(element)
    if (isHidden(style, options.measure(element))) continue

    const foreground = parseColor(style.color)
    if (!foreground) continue

    const background = resolveBackground(element, options.getComputedStyle)
    const ratio = contrastRatio(foreground, background)
    const fontSize = Number.parseFloat(style.fontSize) || 16
    const threshold = contrastThreshold(fontSize, style.fontWeight)
    if (ratio >= threshold) continue

    findings.push({
      rule: "contrast",
      level: "error",
      selector: buildElementPathSelector(element),
      values: { ratio: formatContrastRatio(ratio), threshold: String(threshold) },
    })
  }

  return findings
}

// 规则 4：点击区小于 24×24px。
const auditTargetSize = (doc: Document, options: Required<RunA11yAuditOptions>): A11yFinding[] => {
  const findings: A11yFinding[] = []

  for (const element of Array.from(doc.body.querySelectorAll(INTERACTIVE_SELECTOR))) {
    if (findings.length >= MAX_PER_RULE) break
    if (isInjectedNode(element)) continue

    const style = options.getComputedStyle(element)
    const size = options.measure(element)
    if (isHidden(style, size)) continue
    // 行内文本链接豁免（WCAG 2.5.8 例外）。
    if (element.tagName.toLowerCase() === "a" && style.display.startsWith("inline")) continue
    if (size.width >= MIN_TARGET_SIZE_PX && size.height >= MIN_TARGET_SIZE_PX) continue

    findings.push({
      rule: "target-size",
      level: "warning",
      selector: buildElementPathSelector(element),
      values: {
        width: Math.round(size.width),
        height: Math.round(size.height),
        min: MIN_TARGET_SIZE_PX,
      },
    })
  }

  return findings
}

// 规则 5：表单控件缺少关联 label。
const hasFormLabel = (element: Element, doc: Document): boolean => {
  const id = element.getAttribute("id")
  if (id) {
    const labels = Array.from(doc.querySelectorAll("label[for]"))
    if (labels.some((label) => label.getAttribute("for") === id)) return true
  }
  if (element.closest("label")) return true
  if (element.getAttribute("aria-label")?.trim()) return true
  if (element.getAttribute("aria-labelledby")?.trim()) return true
  if (element.getAttribute("title")?.trim()) return true
  return false
}

const auditFormLabel = (doc: Document): A11yFinding[] =>
  Array.from(doc.body.querySelectorAll(FORM_CONTROL_SELECTOR))
    .filter((element) => {
      if (isInjectedNode(element)) return false
      const type = element.getAttribute("type")?.toLowerCase()
      if (type && SKIPPED_INPUT_TYPES.has(type)) return false
      return !hasFormLabel(element, doc)
    })
    .slice(0, MAX_PER_RULE)
    .map((element) => ({
      rule: "form-label" as const,
      level: "warning" as const,
      selector: buildElementPathSelector(element),
    }))

// 规则 6：文档缺少 lang 属性。
const auditLang = (doc: Document): A11yFinding[] =>
  doc.documentElement.getAttribute("lang")?.trim() ? [] : [{ rule: "lang", level: "warning" }]

/**
 * 运行可用性审计，返回按重要性排序的发现清单（截断到 20 条）。
 */
export const runA11yAudit = (doc: Document, options: RunA11yAuditOptions = {}): A11yFinding[] => {
  if (!doc?.body) return []
  const win = doc.defaultView
  const resolved: Required<RunA11yAuditOptions> = {
    getComputedStyle:
      options.getComputedStyle ??
      ((element: Element) => (win ?? globalThis.window).getComputedStyle(element)),
    measure:
      options.measure ??
      ((element: Element) => {
        const rect = element.getBoundingClientRect()
        return { width: rect.width, height: rect.height }
      }),
  }

  return [
    ...auditContrast(doc, resolved),
    ...auditAccessibleName(doc),
    ...auditAlt(doc),
    ...auditFormLabel(doc),
    ...auditTargetSize(doc, resolved),
    ...auditLang(doc),
  ].slice(0, MAX_TOTAL)
}
