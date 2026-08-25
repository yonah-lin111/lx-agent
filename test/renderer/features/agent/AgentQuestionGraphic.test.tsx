// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import {
  AgentQuestionGraphic,
  sanitizeGraphicContent,
} from "@/features/agent/components/AgentQuestionGraphic"

describe("AgentQuestionGraphic & sanitizeGraphicContent", () => {
  afterEach(() => {
    cleanup()
  })

  it("正确净化并渲染合法 SVG 矢量图与属性", () => {
    const svgCode = `
      <svg viewBox="0 0 100 100" width="100" height="100">
        <circle cx="50" cy="50" r="40" stroke="green" stroke-width="4" fill="yellow" />
        <text x="50" y="55" text-anchor="middle">SVG Test</text>
      </svg>
    `
    const { container } = render(<AgentQuestionGraphic content={svgCode} />)
    const svg = container.querySelector("svg")
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100")
    expect(container.querySelector("circle")).not.toBeNull()
    expect(screen.getByText("SVG Test")).not.toBeNull()
  })

  it("正确净化并渲染合法基础 HTML 标签（表格与代码块）", () => {
    const htmlCode = `
      <div>
        <p>架构对比表格：</p>
        <table>
          <thead>
            <tr><th>模块</th><th>协议</th></tr>
          </thead>
          <tbody>
            <tr><td>Renderer</td><td>IPC</td></tr>
          </tbody>
        </table>
        <pre><code>const a = 1;</code></pre>
      </div>
    `
    const { container } = render(<AgentQuestionGraphic content={htmlCode} />)
    expect(screen.getByText("架构对比表格：")).not.toBeNull()
    expect(container.querySelector("table")).not.toBeNull()
    expect(container.querySelector("th")).not.toBeNull()
    expect(screen.getByText("Renderer")).not.toBeNull()
    expect(container.querySelector("pre code")).not.toBeNull()
  })

  it("防 XSS：彻底剔除 script、iframe、form 等危险标签", () => {
    const maliciousCode = `
      <div>
        <p>正常文本</p>
        <script>alert('xss')</script>
        <iframe src="https://example.com"></iframe>
        <form action="/steal"><input name="pass" /></form>
      </div>
    `
    const sanitized = sanitizeGraphicContent(maliciousCode)
    expect(sanitized).not.toContain("<script")
    expect(sanitized).not.toContain("alert")
    expect(sanitized).not.toContain("<iframe")
    expect(sanitized).not.toContain("<form")
    expect(sanitized).not.toContain("<input")
    expect(sanitized).toContain("正常文本")
  })

  it("防 XSS：彻底剥离 on* 事件处理器与 javascript: 伪协议", () => {
    const maliciousAttrs = `
      <div>
        <svg onload="alert('svg-xss')">
          <circle cx="10" cy="10" r="5" onclick="alert('click')" />
        </svg>
        <a href="javascript:alert('link')">恶意链接</a>
        <div style="background: url('javascript:alert(1)')">Style 注入</div>
      </div>
    `
    const sanitized = sanitizeGraphicContent(maliciousAttrs)
    expect(sanitized).not.toContain("onload")
    expect(sanitized).not.toContain("onclick")
    expect(sanitized).not.toContain("javascript:")
    expect(sanitized).not.toContain("alert")
  })

  it("保留合法的 SVG 内部锚点引用（#id），过滤外部 URL 链接", () => {
    const internalRef = `
      <svg>
        <use href="#icon-star" />
        <a href="https://malicious.com">外部链接</a>
      </svg>
    `
    const sanitized = sanitizeGraphicContent(internalRef)
    expect(sanitized).toContain('href="#icon-star"')
    expect(sanitized).not.toContain("https://malicious.com")
  })

  it("空内容或空字符串不渲染任何 DOM", () => {
    const { container } = render(<AgentQuestionGraphic content="" />)
    expect(container.firstChild).toBeNull()
  })
})
