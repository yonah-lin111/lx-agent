import { describe, expect, it } from "vitest"
import {
  createRenderAsciiTool,
  createRenderHtmlTool,
  createRenderSvgTool,
} from "@/agent/tools/visuals"

describe("visuals tools (render_svg, render_ascii, render_html)", () => {
  it("render_svg 正常执行并返回描述性文本", async () => {
    const tool = createRenderSvgTool()
    expect(tool.name).toBe("render_svg")
    expect(tool.description).toContain("SVG")

    const result = await tool.execute("call-1", {
      svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" /></svg>',
      style: "circle { fill: red; }",
    })

    expect(result.content[0]?.text).toContain("SVG vector diagram rendered successfully.")
  })

  it("render_ascii 正常执行并返回描述性文本", async () => {
    const tool = createRenderAsciiTool()
    expect(tool.name).toBe("render_ascii")
    expect(tool.description).toContain("ASCII")

    const result = await tool.execute("call-2", {
      ascii: "┌───┐\n│ A │\n└───┘",
    })

    expect(result.content[0]?.text).toContain("ASCII diagram rendered successfully.")
  })

  it("render_html 正常执行并返回描述性文本", async () => {
    const tool = createRenderHtmlTool()
    expect(tool.name).toBe("render_html")
    expect(tool.description).toContain("HTML")

    const result = await tool.execute("call-3", {
      html: '<table class="w-full border border-zinc-800"><thead class="bg-zinc-900"><tr class="text-white"><th class="p-2">Plan</th></tr></thead></table>',
    })

    expect(result.content[0]?.text).toContain("HTML prototype rendered successfully.")
  })
})
