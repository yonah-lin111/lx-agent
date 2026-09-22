// 颜色解析与对比度计算：供可用性审计使用，纯函数不触碰 DOM。

// RGBA 颜色分量：r/g/b 取值 0-255，a 取值 0-1。
export interface RgbaColor {
  r: number
  g: number
  b: number
  a: number
}

const HEX_PATTERN = /^#([0-9a-f]{3,8})$/i
const RGB_PATTERN =
  /^rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*(?:[,/]\s*([0-9.]+%?)\s*)?\)$/i
const NAMED_COLORS: Record<string, string> = {
  transparent: "#00000000",
  black: "#000000",
  white: "#ffffff",
}

const clampChannel = (value: number): number => Math.min(255, Math.max(0, Math.round(value)))

const parseAlpha = (raw?: string): number => {
  if (!raw) return 1
  const value = raw.endsWith("%") ? Number.parseFloat(raw) / 100 : Number.parseFloat(raw)
  if (!Number.isFinite(value)) return 1
  return Math.min(1, Math.max(0, value))
}

/**
 * 解析 CSS 颜色字符串（hex / rgb / rgba / 少量具名色）；无法解析时返回 null。
 */
export const parseColor = (value: string | null | undefined): RgbaColor | null => {
  if (!value) return null
  const input = value.trim().toLowerCase()
  const source = NAMED_COLORS[input] ?? input

  const hexMatch = HEX_PATTERN.exec(source)
  if (hexMatch) {
    const digits = hexMatch[1]
    const expand = (part: string): number =>
      Number.parseInt(part.length === 1 ? part + part : part, 16)

    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]),
        g: expand(digits[1]),
        b: expand(digits[2]),
        a: digits.length === 4 ? expand(digits[3]) / 255 : 1,
      }
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1,
      }
    }
    return null
  }

  const rgbMatch = RGB_PATTERN.exec(source)
  if (rgbMatch) {
    return {
      r: clampChannel(Number.parseFloat(rgbMatch[1])),
      g: clampChannel(Number.parseFloat(rgbMatch[2])),
      b: clampChannel(Number.parseFloat(rgbMatch[3])),
      a: parseAlpha(rgbMatch[4]),
    }
  }

  return null
}

/**
 * alpha 合成：把前景色叠加到已有背景色之上。
 */
export const compositeColor = (foreground: RgbaColor, background: RgbaColor): RgbaColor => {
  const alpha = foreground.a + background.a * (1 - foreground.a)
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 }
  const blend = (fg: number, bg: number): number =>
    (fg * foreground.a + bg * background.a * (1 - foreground.a)) / alpha

  return {
    r: clampChannel(blend(foreground.r, background.r)),
    g: clampChannel(blend(foreground.g, background.g)),
    b: clampChannel(blend(foreground.b, background.b)),
    a: alpha,
  }
}

/**
 * 归一化为 `#rrggbb`（丢弃 alpha 分量，半透明色请保留原值展示）。
 */
export const formatHexColor = (color: RgbaColor): string =>
  `#${[color.r, color.g, color.b]
    .map((channel) => clampChannel(channel).toString(16).padStart(2, "0"))
    .join("")}`

/**
 * 相对亮度（WCAG 2.1 定义）。
 */
export const relativeLuminance = (color: RgbaColor): number => {
  const channel = (value: number): number => {
    const ratio = value / 255
    return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * 对比度比值，范围 1-21；半透明前景先与背景合成。
 */
export const contrastRatio = (foreground: RgbaColor, background: RgbaColor): number => {
  const effective = foreground.a < 1 ? compositeColor(foreground, background) : foreground
  const light = Math.max(relativeLuminance(effective), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(effective), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

/**
 * 大字判定：字号 ≥ 24px，或 ≥ 18.66px 且字重 ≥ 700。
 */
export const isLargeText = (fontSizePx: number, fontWeight: number | string): boolean => {
  const weight =
    typeof fontWeight === "string" && !Number.isFinite(Number.parseFloat(fontWeight))
      ? fontWeight.toLowerCase()
      : Number.parseFloat(String(fontWeight))
  // 关键字加粗（bold / bolder）等价于 700 及以上。
  const isBold =
    weight === "bold" || weight === "bolder" || (typeof weight === "number" && weight >= 700)
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && isBold)
}

/**
 * 对比度阈值：大字 3:1，正文 4.5:1。
 */
export const contrastThreshold = (fontSizePx: number, fontWeight: number | string): number =>
  isLargeText(fontSizePx, fontWeight) ? 3 : 4.5

/**
 * 对比度格式化：保留两位小数。
 */
export const formatContrastRatio = (ratio: number): string => ratio.toFixed(2)
