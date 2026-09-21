// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"
import {
  applyHtmlThemeClass,
  syncElementAttributes,
} from "@/pages/front-design/hooks/useDesignPreview"

describe("设计预览文档管线（净化 + 主题类）", () => {
  it("body 布局类经净化后仍保留，<html> 正确获得 dark 类", () => {
    const rawHtml = `<!DOCTYPE html><html lang="zh-CN"><head></head><body class="min-h-screen flex items-center justify-center bg-zinc-950"><div class="w-full max-w-2xl">智能实例与部署</div></body></html>`

    const doc = applyHtmlThemeClass(sanitizeHtmlDocument(rawHtml, { allowScripts: true }), true)

    expect(doc).toContain('<html lang="zh-CN" class="dark">')
    expect(doc).toContain('class="min-h-screen flex items-center justify-center bg-zinc-950"')
  })
})

describe("applyHtmlThemeClass", () => {
  it("暗色模式为 <html> 追加 dark 类且不触碰组件上的 dark: 变体类名", () => {
    const source = `<html lang="zh-CN"><body class="dark:bg-zinc-900 dark:text-white">内容</body></html>`

    const result = applyHtmlThemeClass(source, true)

    expect(result).toContain('<html lang="zh-CN" class="dark">')
    expect(result).toContain('class="dark:bg-zinc-900 dark:text-white"')
  })

  it("暗色模式下无 class 属性时补建 class", () => {
    expect(applyHtmlThemeClass("<html><body></body></html>", true)).toContain('<html class="dark">')
  })

  it("亮色模式仅从 <html> 移除 dark，保留 dark: 变体类名", () => {
    const source = `<html class="dark h-full"><body class="dark:bg-zinc-900">内容</body></html>`

    const result = applyHtmlThemeClass(source, false)

    expect(result).toContain('<html class="h-full">')
    expect(result).toContain('class="dark:bg-zinc-900"')
  })

  it("亮色模式下 html 无 class 时不注入空 class 属性", () => {
    expect(applyHtmlThemeClass("<html><body></body></html>", false)).toBe(
      "<html><body></body></html>",
    )
  })

  it("缺少 <html> 标签时原样返回", () => {
    expect(applyHtmlThemeClass("<body>fragment</body>", true)).toBe("<body>fragment</body>")
  })
})

describe("syncElementAttributes", () => {
  it("双向同步属性：新增、覆盖与移除", () => {
    const target = document.createElement("body")
    target.setAttribute("class", "p-4")
    target.setAttribute("data-stale", "1")
    const source = document.createElement("body")
    source.setAttribute("class", "min-h-screen flex items-center justify-center")
    source.setAttribute("lang", "zh-CN")

    syncElementAttributes(target, source)

    expect(target.getAttribute("class")).toBe("min-h-screen flex items-center justify-center")
    expect(target.getAttribute("lang")).toBe("zh-CN")
    expect(target.hasAttribute("data-stale")).toBe(false)
  })
})
