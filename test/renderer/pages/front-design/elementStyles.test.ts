// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import {
  formatBoxShorthand,
  summarizeElementStyles,
} from "@/pages/front-design/utils/elementStyles"

const createElement = (styles: Partial<CSSStyleDeclaration>): HTMLElement => {
  const element = document.createElement("div")
  for (const [key, value] of Object.entries(styles)) {
    if (value) element.style[key as never] = value as never
  }
  document.body.appendChild(element)
  return element
}

describe("formatBoxShorthand", () => {
  it("四值全等折叠为单值", () => {
    expect(formatBoxShorthand(["8px", "8px", "8px", "8px"])).toBe("8px")
  })

  it("上下 / 左右成对折叠为两值", () => {
    expect(formatBoxShorthand(["8px", "16px", "8px", "16px"])).toBe("8px 16px")
  })

  it("左右相等折叠为三值", () => {
    expect(formatBoxShorthand(["8px", "16px", "12px", "16px"])).toBe("8px 16px 12px")
  })

  it("各不相同保持四值", () => {
    expect(formatBoxShorthand(["1px", "2px", "3px", "4px"])).toBe("1px 2px 3px 4px")
  })

  it("全零或关键字（auto / normal）返回 null", () => {
    expect(formatBoxShorthand(["0px", "0px", "0px", "0px"])).toBeNull()
    expect(formatBoxShorthand(["auto", "auto", "auto", "auto"])).toBeNull()
  })
})

describe("summarizeElementStyles", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("折叠间距、字体、颜色、圆角与边框，零值字段为 null", () => {
    const element = createElement({
      padding: "8px 16px",
      margin: "0px",
      fontSize: "14px",
      lineHeight: "20px",
      fontWeight: "700",
      color: "rgb(17, 24, 39)",
      backgroundColor: "rgb(255, 255, 255)",
      borderRadius: "8px",
      border: "1px solid rgb(229, 231, 235)",
    })

    expect(summarizeElementStyles(element)).toEqual({
      padding: "8px 16px",
      margin: null,
      font: "14px/20px 700",
      color: "#111827",
      background: "#ffffff",
      radius: "8px",
      border: "1px solid #e5e7eb",
    })
  })

  it("行高 normal 省略，字重低于 600 省略", () => {
    const element = createElement({
      fontSize: "13px",
      lineHeight: "normal",
      fontWeight: "400",
    })

    const summary = summarizeElementStyles(element)
    expect(summary.font).toBe("13px")
    expect(summary.padding).toBeNull()
    expect(summary.radius).toBeNull()
  })

  it("透明背景与无边框为 null，半透明颜色保留原值", () => {
    const element = createElement({
      backgroundColor: "transparent",
      borderWidth: "0px",
      color: "rgba(255, 255, 255, 0.5)",
    })

    const summary = summarizeElementStyles(element)
    expect(summary.background).toBeNull()
    expect(summary.border).toBeNull()
    expect(summary.color).toBe("rgba(255, 255, 255, 0.5)")
  })

  it("合成文档（无 defaultView）返回全空摘要", () => {
    const doc = document.implementation.createHTMLDocument("no-view")
    const element = doc.createElement("div")
    doc.body.appendChild(element)

    expect(summarizeElementStyles(element)).toEqual({
      padding: null,
      margin: null,
      font: null,
      color: null,
      background: null,
      radius: null,
      border: null,
    })
  })
})
