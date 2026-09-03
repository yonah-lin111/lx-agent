import { describe, expect, it } from "vitest"
import { compileTailwindCss, extractTailwindCandidates } from "@/services/tailwindCompilerService"

describe("tailwindCompilerService", () => {
  it("正确提取 HTML 中的各种 Tailwind class 与属性 token", () => {
    const html = `
      <div class="min-h-screen bg-[#090a0f] flex items-center justify-center p-4">
        <h1 class="text-2xl font-bold text-white tracking-tight">Login</h1>
        <div class="space-y-1.5 w-full max-w-md"></div>
      </div>
    `
    const candidates = extractTailwindCandidates(html)
    expect(candidates).toContain("min-h-screen")
    expect(candidates).toContain("bg-[#090a0f]")
    expect(candidates).toContain("flex")
    expect(candidates).toContain("text-2xl")
    expect(candidates).toContain("space-y-1.5")
  })

  it("能快速编译生成包含原子样式与 base 重置的完整 CSS", async () => {
    const html = `
      <div class="bg-[#090a0f] text-slate-200 rounded-2xl flex items-center p-4">
        <span class="text-indigo-400 font-bold">Hello</span>
      </div>
    `
    const css = await compileTailwindCss(html)
    expect(css).toContain(".bg-\\[\\#090a0f\\]")
    expect(css).toContain("#090a0f")
    expect(css).toContain("display: flex")
    expect(css).toContain("border-radius: var(--radius-2xl)")
    expect(css).toContain("--radius-2xl: 1rem")
  })

  it("空 HTML 返回空字符串", async () => {
    const css = await compileTailwindCss("")
    expect(css).toBe("")
  })
})
