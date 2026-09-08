// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  extractDesignTargetContext,
  generateElementSelector,
  synthesizeDesignUpdate,
} from "@/features/agent/utils/designSynthesizer"

describe("designSynthesizer DOM 树定向替换与切片提取", () => {
  const sampleHtml = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <title>Dashboard App</title>
</head>
<body class="bg-zinc-950 text-white min-h-screen">
  <header id="main-header" class="p-4 border-b">
    <h1>Site Title</h1>
  </header>
  <main class="container mx-auto p-6">
    <section data-section="hero">
      <h2 id="hero-title">Welcome Home</h2>
      <button id="cta-btn" class="px-4 py-2 bg-blue-600">Old Action</button>
    </section>
  </main>
</body>
</html>`

  describe("synthesizeDesignUpdate", () => {
    it("精确替换目标节点并保留整体骨架与 DOCTYPE", () => {
      const fragment = `<button id="cta-btn" class="px-6 py-3 bg-gradient-to-r from-pink-500 to-purple-600 font-bold">New Action</button>`
      const result = synthesizeDesignUpdate(sampleHtml, "#cta-btn", fragment)

      expect(result.ok).toBe(true)
      expect(result.synthesizedHtml).toBeDefined()
      expect(result.synthesizedHtml).toContain("<!DOCTYPE html>")
      expect(result.synthesizedHtml).toContain("New Action")
      expect(result.synthesizedHtml).toContain("bg-gradient-to-r")
      expect(result.synthesizedHtml).not.toContain("Old Action")
      // 保持 header 和其他结构不变
      expect(result.synthesizedHtml).toContain("Site Title")
      expect(result.synthesizedHtml).toContain("Welcome Home")
    })

    it("支持通过 data-section 属性选择器精确替换子树", () => {
      const fragment = `<section data-section="hero" class="p-10 bg-black"><h2>Updated Hero Block</h2></section>`
      const result = synthesizeDesignUpdate(sampleHtml, '[data-section="hero"]', fragment)

      expect(result.ok).toBe(true)
      expect(result.synthesizedHtml).toContain("Updated Hero Block")
      expect(result.synthesizedHtml).not.toContain("Welcome Home")
      expect(result.synthesizedHtml).not.toContain("Old Action")
    })

    it("当选择器不存在时，返回错误并不产生破损 HTML", () => {
      const result = synthesizeDesignUpdate(sampleHtml, "#non-existent", "<div />")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("Target node not found")
      expect(result.synthesizedHtml).toBeUndefined()
    })

    it("当选择器语法错误时，优雅返回错误信息", () => {
      const result = synthesizeDesignUpdate(sampleHtml, "###invalid[selector", "<div />")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("Invalid selector")
    })
  })

  describe("extractDesignTargetContext", () => {
    it("正确提取全局骨架环境与目标节点 outerHTML", () => {
      const result = extractDesignTargetContext(sampleHtml, "#cta-btn")

      expect(result.ok).toBe(true)
      expect(result.globalContext).toContain("theme: dark")
      expect(result.globalContext).toContain("body_classes")
      expect(result.globalContext).toContain("bg-zinc-950")
      expect(result.targetElementHtml).toBe(
        '<button id="cta-btn" class="px-4 py-2 bg-blue-600">Old Action</button>',
      )
    })

    it("目标元素不存在时返回错误", () => {
      const result = extractDesignTargetContext(sampleHtml, "#missing-target")
      expect(result.ok).toBe(false)
      expect(result.error).toContain("Target element not found")
    })
  })

  describe("generateElementSelector", () => {
    it("元素有 id 时优先返回 #id", () => {
      const btn = document.createElement("button")
      btn.id = "submit-action"
      const res = generateElementSelector(btn)
      expect(res.selector).toBe("#submit-action")
      expect(res.description).toBe("button#submit-action")
      expect(res.injectedAttr).toBeUndefined()
    })

    it("元素有 data-section 时优先返回 [data-section=...]", () => {
      const sec = document.createElement("section")
      sec.setAttribute("data-section", "pricing-table")
      const res = generateElementSelector(sec)
      expect(res.selector).toBe("[data-section=pricing-table]")
      expect(res.description).toBe("section[data-section=pricing-table]")
    })

    it("无唯一属性时自动注入 data-design-id 且生成无内嵌引号的标准选择器", () => {
      const div = document.createElement("div")
      const res = generateElementSelector(div)
      expect(res.selector).toMatch(/^\[data-design-id=el-[a-z0-9-]+]$/)
      expect(res.injectedAttr?.name).toBe("data-design-id")
      expect(div.getAttribute("data-design-id")).toBeDefined()
    })

    it("synthesizeDesignUpdate 支持容忍带内嵌引号的目标选择器与语义结构回退", () => {
      // 模拟基准 HTML 中包含目标元素，但 targetSelector 带有内嵌引号
      const htmlWithTarget =
        '<div id="root"><svg class="w-6 h-6" data-design-id="el-123"></svg></div>'
      const res1 = synthesizeDesignUpdate(
        htmlWithTarget,
        '[data-design-id="el-123"]',
        '<svg class="w-8 h-8" id="new-icon"></svg>',
      )
      expect(res1.ok).toBe(true)
      expect(res1.synthesizedHtml).toContain('id="new-icon"')

      // 模拟历史基准 HTML 中未曾注入 data-design-id，语义回退成功找到唯一匹配节点并替换
      const htmlHistorical = '<div id="root"><button class="btn-submit">Submit</button></div>'
      const res2 = synthesizeDesignUpdate(
        htmlHistorical,
        "[data-design-id=el-historical-999]",
        '<button class="btn-submit">Loading...</button>',
      )
      expect(res2.ok).toBe(true)
      expect(res2.synthesizedHtml).toContain("Loading...")
    })
  })
})
