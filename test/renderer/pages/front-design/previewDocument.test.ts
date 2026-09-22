// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"
import {
  applyHtmlThemeClass,
  buildPreviewDocument,
} from "@/pages/front-design/utils/previewDocument"

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

describe("buildPreviewDocument", () => {
  const build = (overrides: Partial<Parameters<typeof buildPreviewDocument>[1]> = {}): string =>
    buildPreviewDocument("<!DOCTYPE html><html><head></head><body><div>hi</div></body></html>", {
      effectiveMode: "dark",
      ...overrides,
    })

  it("按序注入沙箱守卫、错误守卫、主题覆盖与 Tailwind 样式，且都位于 </head> 之前", () => {
    const doc = build({ compiledTailwindCss: ".p-4{padding:1rem}" })
    const headCloseIndex = doc.indexOf("</head>")
    const guardIndex = doc.indexOf('<script id="lx-sandbox-guard">')
    const errorGuardIndex = doc.indexOf('<script id="lx-preview-error-guard">')
    const themeStyleIndex = doc.indexOf('<style id="lx-front-design-theme-override">')
    const tailwindStyleIndex = doc.indexOf('<style id="lx-front-design-tailwind-compiled">')

    expect(headCloseIndex).toBeGreaterThan(-1)
    expect(guardIndex).toBeGreaterThan(-1)
    expect(errorGuardIndex).toBeGreaterThan(guardIndex)
    expect(errorGuardIndex).toBeLessThan(headCloseIndex)
    expect(themeStyleIndex).toBeGreaterThan(errorGuardIndex)
    expect(tailwindStyleIndex).toBeGreaterThan(themeStyleIndex)
    expect(tailwindStyleIndex).toBeLessThan(headCloseIndex)
    expect(doc).toContain(".p-4{padding:1rem}")
  })

  it("无编译结果时不注入 Tailwind 样式节点", () => {
    const doc = build()
    expect(doc).not.toContain("lx-front-design-tailwind-compiled")
  })

  it("withErrorGuard=false 时不注入错误采集守卫（对照窗只读预览）", () => {
    const doc = build({ withErrorGuard: false })
    expect(doc).not.toContain("lx-preview-error-guard")
    expect(doc).toContain('<script id="lx-sandbox-guard">')
  })

  it("dark/light 模式分别增删 <html> 的 dark 类", () => {
    expect(build({ effectiveMode: "dark" })).toContain('<html class="dark">')
    expect(build({ effectiveMode: "light" })).toContain("<html>")
    expect(build({ effectiveMode: "light" })).not.toContain('class="dark"')
  })

  it("空 HTML 返回空串", () => {
    expect(buildPreviewDocument("", { effectiveMode: "dark" })).toBe("")
  })

  it("片段输入经净化后仍保留原始内容并完整注入守卫与主题样式", () => {
    const doc = buildPreviewDocument("<body>fragment</body>", { effectiveMode: "dark" })
    expect(doc).toContain("<body>fragment</body>")
    expect(doc).toContain('<script id="lx-sandbox-guard">')
    expect(doc).toContain('<style id="lx-front-design-theme-override">')
  })
})
