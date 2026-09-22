// 元素计算样式摘要：供批注编辑器展示间距 / 字体 / 颜色 / 圆角 / 边框（只读计算样式，不改动 DOM）。

import { formatHexColor, parseColor } from "@/pages/front-design/utils/contrast"

export type ElementStyleKey =
  | "padding"
  | "margin"
  | "font"
  | "color"
  | "background"
  | "radius"
  | "border"

// 元素计算样式摘要：无意义字段为 null，由渲染层跳过。
export interface ElementStyleSummary {
  padding: string | null
  margin: string | null
  // 字号/行高（行高 normal 时省略），字重 ≥ 600 时追加。
  font: string | null
  color: string | null
  background: string | null
  radius: string | null
  border: string | null
}

// 零长度与关键字（auto / normal）统一视为无效值。
const isZeroLength = (value: string): boolean => {
  const parsed = Number.parseFloat(value)
  return !Number.isFinite(parsed) || parsed === 0
}

// 颜色归一化：透明返回 null；半透明保留原值（hex 无法表达 alpha）；不透明转 hex。
const normalizeColor = (value: string | null | undefined): string | null => {
  const parsed = parseColor(value)
  if (!parsed || parsed.a === 0) return null
  return parsed.a < 1 ? (value ?? "").trim().toLowerCase() : formatHexColor(parsed)
}

/**
 * 四值 shorthand 折叠：全 0 返回 null；四值全等 → 1 值；上下 / 左右成对 → 2 值；左右相等 → 3 值；否则 4 值。
 */
export const formatBoxShorthand = (values: [string, string, string, string]): string | null => {
  const [top, right, bottom, left] = values
  if ([top, right, bottom, left].every((value) => isZeroLength(value))) return null
  if (top === right && right === bottom && bottom === left) return top
  if (top === bottom && right === left) return `${top} ${right}`
  if (right === left) return `${top} ${right} ${bottom}`
  return `${top} ${right} ${bottom} ${left}`
}

/**
 * 读取元素计算样式摘要；环境不支持计算样式时所有字段为 null。
 */
export const summarizeElementStyles = (element: Element): ElementStyleSummary => {
  // 只信任元素所属文档的视图：合成文档（无 defaultView）按不可计算处理。
  const view = element.ownerDocument?.defaultView ?? null
  let style: CSSStyleDeclaration | null = null
  try {
    style = view?.getComputedStyle?.(element) ?? null
  } catch {
    style = null
  }
  if (!style) {
    return {
      padding: null,
      margin: null,
      font: null,
      color: null,
      background: null,
      radius: null,
      border: null,
    }
  }

  const padding = formatBoxShorthand([
    style.paddingTop,
    style.paddingRight,
    style.paddingBottom,
    style.paddingLeft,
  ])
  const margin = formatBoxShorthand([
    style.marginTop,
    style.marginRight,
    style.marginBottom,
    style.marginLeft,
  ])

  const lineHeight = style.lineHeight
  let font = style.fontSize || null
  if (font && lineHeight && lineHeight !== "normal") font = `${font}/${lineHeight}`
  const weight = Number.parseFloat(style.fontWeight)
  if (font && Number.isFinite(weight) && weight >= 600) font = `${font} ${style.fontWeight}`

  const borderWidth = style.borderTopWidth
  const border =
    isZeroLength(borderWidth) || style.borderTopStyle === "none"
      ? null
      : `${borderWidth} ${style.borderTopStyle} ${normalizeColor(style.borderTopColor) ?? style.borderTopColor}`

  // 部分环境不展开 border-radius shorthand：逐角为零时回退整体值。
  const longhandRadius = style.borderTopLeftRadius
  const radiusValue = isZeroLength(longhandRadius) ? style.borderRadius : longhandRadius

  return {
    padding,
    margin,
    font,
    color: normalizeColor(style.color),
    background: normalizeColor(style.backgroundColor),
    radius: isZeroLength(radiusValue) ? null : radiusValue,
    border,
  }
}
