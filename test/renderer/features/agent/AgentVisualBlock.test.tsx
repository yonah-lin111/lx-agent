// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AgentVisualBlock } from "@/features/agent/components/blocks/AgentVisualBlock"
import type { ChatBlock } from "@/features/agent/types"

// jsdom mock ResizeObserver
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

describe("AgentVisualBlock", () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
  })

  it("正确渲染 render_svg 工具调用、标题、说明 Markdown 与 SVG 图形", () => {
    const toolCall: ToolCallBlock = {
      kind: "toolCall",
      toolCallId: "v-call-1",
      toolName: "render_svg",
      status: "done",
      args: {
        title: "微服务架构拓扑",
        description: "**核心要点**：通过 API Gateway 进行统一路由鉴权。",
        svg: '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="40" fill="#1e293b" /><text x="50" y="35">Gateway</text></svg>',
      },
    }

    const { container } = render(<AgentVisualBlock toolCall={toolCall} />)
    expect(screen.getByText("微服务架构拓扑")).not.toBeNull()
    expect(screen.getByText("核心要点")).not.toBeNull()
    expect(screen.getByText("Gateway")).not.toBeNull()
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("正确渲染 render_ascii 字符图案与说明", () => {
    const toolCall: ToolCallBlock = {
      kind: "toolCall",
      toolCallId: "v-call-2",
      toolName: "render_ascii",
      status: "done",
      args: {
        title: "构建流转图",
        description: "从代码提交到容器部署的全流程：",
        ascii: "┌───┐   ┌───┐\n│Git│──►│ CI│\n└───┘   └───┘",
      },
    }

    const { container } = render(<AgentVisualBlock toolCall={toolCall} />)
    expect(screen.getByText("构建流转图")).not.toBeNull()
    expect(screen.getByText("从代码提交到容器部署的全流程：")).not.toBeNull()
    const pre = container.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.textContent).toContain("┌───┐")
    expect(pre?.textContent).toContain("│Git│")
  })

  it("正确渲染 render_html 结构化内容与折叠交互", () => {
    const toolCall: ToolCallBlock = {
      kind: "toolCall",
      toolCallId: "v-call-3",
      toolName: "render_html",
      status: "done",
      args: {
        title: "方案横向对比",
        html: "<table><thead><tr><th>技术</th><th>延迟</th></tr></thead><tbody><tr><td>Redis</td><td>1ms</td></tr></tbody></table>",
      },
    }

    const { container } = render(<AgentVisualBlock toolCall={toolCall} />)
    expect(screen.getByText("方案横向对比")).not.toBeNull()
    expect(screen.getByText("Redis")).not.toBeNull()
    expect(screen.getByText("1ms")).not.toBeNull()

    // 测试折叠展开按钮
    const button = screen.getByRole("button", { name: "方案横向对比" })
    expect(button.getAttribute("aria-expanded")).toBe("true")
    fireEvent.click(button)
    expect(button.getAttribute("aria-expanded")).toBe("false")
  })
})
