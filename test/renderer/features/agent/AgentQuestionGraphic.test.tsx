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

  it("正确净化并在独立沙箱 iframe 中渲染合法前端原型标签（按钮、输入框、表单、卡片与表格）", () => {
    const htmlCode = `
      <div class="prototype-card">
        <h3>用户注册原型</h3>
        <form>
          <label for="username">用户名</label>
          <input id="username" type="text" placeholder="请输入用户名" value="admin" />
          <button type="button">提交</button>
        </form>
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
    const iframe = container.querySelector("iframe")
    expect(iframe).not.toBeNull()
    expect(iframe?.getAttribute("sandbox")).toBe("allow-same-origin")
    const srcDoc = iframe?.getAttribute("srcdoc") || ""
    expect(srcDoc).toContain("用户注册原型")
    expect(srcDoc).toContain("<form")
    expect(srcDoc).toContain("<input")
    expect(srcDoc).toContain("<button")
    expect(srcDoc).toContain("<table")
    expect(srcDoc).toContain("<th")
    expect(srcDoc).toContain("Renderer")
  })

  it("防 XSS：彻底剔除 script、iframe 等危险可执行标签", () => {
    const maliciousCode = `
      <div>
        <p>正常文本</p>
        <script>alert('xss')</script>
        <iframe src="https://example.com"></iframe>
      </div>
    `
    const sanitized = sanitizeGraphicContent(maliciousCode)
    expect(sanitized).not.toContain("<script")
    expect(sanitized).not.toContain("alert")
    expect(sanitized).not.toContain("<iframe")
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

  it("保留合法的 SVG 内部锚点引用（#id）与安全链接，过滤危险 javascript: 伪协议", () => {
    const internalRef = `
      <svg>
        <use href="#icon-star" />
        <a href="javascript:alert(1)">恶意伪协议</a>
        <a href="#dashboard">仪表盘</a>
      </svg>
    `
    const sanitized = sanitizeGraphicContent(internalRef)
    expect(sanitized).toContain('href="#icon-star"')
    expect(sanitized).toContain('href="#dashboard"')
    expect(sanitized).not.toContain("javascript:")
  })

  it("正确渲染纯文本与 Claude Code 风格字符图案（ASCII Art）", () => {
    const asciiArt = `┌─────┐\n│ Box │\n└─────┘`
    const { container } = render(<AgentQuestionGraphic content={asciiArt} />)
    const pre = container.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain("┌─────┐")
    expect(pre?.textContent).toContain("│ Box │")
    expect(pre?.textContent).toContain("└─────┘")
  })

  it("空内容或空字符串不渲染任何 DOM", () => {
    const { container } = render(<AgentQuestionGraphic content="" />)
    expect(container.firstChild).toBeNull()
  })
})
