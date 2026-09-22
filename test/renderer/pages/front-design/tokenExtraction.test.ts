// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { extractDesignTokens } from "@/pages/front-design/utils/tokenExtraction"

const setup = (html: string): Document => {
  document.body.innerHTML = html
  return document
}

describe("extractDesignTokens", () => {
  afterEach(() => {
    document.body.innerHTML = ""
    document.body.removeAttribute("style")
  })

  it("按出现频次降序返回颜色，并列时保持首次出现顺序", () => {
    const doc = setup(`
      <div style="color: rgb(17, 24, 39)"></div>
      <div style="color: rgb(17, 24, 39)"></div>
      <div style="color: rgb(236, 72, 153)"></div>
      <div style="color: rgb(59, 130, 246)"></div>
    `)

    expect(extractDesignTokens(doc).colors).toEqual(["#111827", "#ec4899", "#3b82f6"])
  })

  it("跳过透明与半透明颜色", () => {
    const doc = setup(`
      <div style="color: rgb(17, 24, 39); background-color: transparent"></div>
      <div style="color: rgba(0, 0, 0, 0.5)"></div>
      <div style="background-color: rgba(255, 255, 255, 0)"></div>
    `)

    expect(extractDesignTokens(doc).colors).toEqual(["#111827"])
  })

  it("边框颜色仅在边框宽度大于 0 时统计", () => {
    const doc = setup(`
      <div style="border-top-width: 2px; border-top-style: solid; border-top-color: rgb(16, 185, 129)"></div>
      <div style="border-top-width: 0px; border-top-style: solid; border-top-color: rgb(239, 68, 68)"></div>
    `)

    const colors = extractDesignTokens(doc).colors
    expect(colors).toContain("#10b981")
    expect(colors).not.toContain("#ef4444")
  })

  it("圆角取最高频非零值，色板数量受 maxColors 限制", () => {
    const doc = setup(`
      <div style="border-radius: 8px"></div>
      <div style="border-radius: 8px"></div>
      <div style="border-radius: 4px"></div>
      <div style="border-radius: 0px"></div>
      <div style="color: rgb(1, 2, 3)"></div>
      <div style="color: rgb(1, 2, 4)"></div>
      <div style="color: rgb(1, 2, 5)"></div>
    `)

    const extracted = extractDesignTokens(doc, { maxColors: 2 })
    expect(extracted.radius).toBe("8px")
    expect(extracted.colors).toHaveLength(2)
  })

  it("字体取 body 计算字体栈首项，默认字体族返回 null", () => {
    const doc = setup("<div></div>")
    document.body.style.fontFamily = '"Inter", sans-serif'
    expect(extractDesignTokens(doc).fontFamily).toBe("Inter")

    document.body.style.fontFamily = "serif"
    expect(extractDesignTokens(doc).fontFamily).toBeNull()

    document.body.style.fontFamily = '"Times New Roman", serif'
    expect(extractDesignTokens(doc).fontFamily).toBeNull()
  })

  it("跳过注入容器（#lx-*）与脚本样式节点中的样式", () => {
    const doc = setup(`
      <div id="lx-design-annotation-layer">
        <div style="color: rgb(255, 0, 0)"></div>
      </div>
      <style>.x { color: rgb(0, 255, 0); }</style>
      <div style="color: rgb(17, 24, 39)"></div>
    `)

    expect(extractDesignTokens(doc).colors).toEqual(["#111827"])
  })

  it("空文档或缺少视图时返回空结果", () => {
    expect(extractDesignTokens(null)).toEqual({ colors: [], radius: null, fontFamily: null })
    const emptyDoc = document.implementation.createHTMLDocument("empty")
    expect(extractDesignTokens(emptyDoc)).toEqual({
      colors: [],
      radius: null,
      fontFamily: null,
    })
  })
})
