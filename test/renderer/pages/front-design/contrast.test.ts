import { describe, expect, it } from "vitest"
import {
  compositeColor,
  contrastRatio,
  contrastThreshold,
  formatContrastRatio,
  isLargeText,
  parseColor,
  relativeLuminance,
} from "@/pages/front-design/utils/contrast"

const BLACK = { r: 0, g: 0, b: 0, a: 1 }
const WHITE = { r: 255, g: 255, b: 255, a: 1 }

describe("颜色解析与对比度", () => {
  it("解析 3 / 4 / 6 / 8 位 hex", () => {
    expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor("#ffff")).toEqual({ r: 255, g: 255, b: 255, a: 1 })
    expect(parseColor("#ec4899")).toEqual({ r: 236, g: 72, b: 153, a: 1 })
    expect(parseColor("#ec489980")?.a).toBeCloseTo(128 / 255, 5)
  })

  it("解析 rgb / rgba / 空格斜杠语法", () => {
    expect(parseColor("rgb(236, 72, 153)")).toEqual({ r: 236, g: 72, b: 153, a: 1 })
    expect(parseColor("rgba(0, 0, 0, 0.5)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
    expect(parseColor("rgb(0 0 0 / 50%)")).toEqual({ r: 0, g: 0, b: 0, a: 0.5 })
  })

  it("解析具名色与透明，非法值返回 null", () => {
    expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0 })
    expect(parseColor("white")).toEqual(WHITE)
    expect(parseColor("currentcolor")).toBeNull()
    expect(parseColor("")).toBeNull()
    expect(parseColor(null)).toBeNull()
  })

  it("半透明前景先与背景合成", () => {
    expect(compositeColor({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)).toEqual({
      r: 128,
      g: 128,
      b: 128,
      a: 1,
    })
  })

  it("相对亮度：黑 0、白 1", () => {
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5)
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5)
  })

  it("对比度：黑白为 21:1，同色为 1:1", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 4)
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  it("半透明前景参与对比度计算", () => {
    const ratio = contrastRatio({ r: 0, g: 0, b: 0, a: 0.5 }, WHITE)
    // 合成色 #808080 对白底约为 3.95:1
    expect(ratio).toBeGreaterThan(3.9)
    expect(ratio).toBeLessThan(4)
  })

  it("大字阈值 3:1，正文 4.5:1", () => {
    expect(isLargeText(24, 400)).toBe(true)
    expect(isLargeText(18.66, 700)).toBe(true)
    expect(isLargeText(18, 700)).toBe(false)
    expect(contrastThreshold(24, 400)).toBe(3)
    expect(contrastThreshold(18.66, "bold")).toBe(3)
    expect(contrastThreshold(16, 400)).toBe(4.5)
  })

  it("对比度格式化保留两位小数", () => {
    expect(formatContrastRatio(2.0987)).toBe("2.10")
    expect(formatContrastRatio(4.5)).toBe("4.50")
  })
})
