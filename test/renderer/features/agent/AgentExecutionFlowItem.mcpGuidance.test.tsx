// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import type { ExecutionStep } from "@/features/agent/types"

const buildSystemStep = (sections: { name: string; text: string }[]): ExecutionStep => ({
  id: "step-system-1",
  turnIndex: 0,
  stepIndex: 1,
  kind: "system",
  title: "System Prompt",
  status: "done",
  systemContent: {
    sections,
    contexts: [],
    variables: {},
    rendered: sections.map((section) => section.text).join("\n\n"),
  },
})

const MCP_GUIDANCE_TEXT = [
  "<mcp_guidance>",
  "  <priority>These MCP servers are the PRIMARY strategy for researching and locating code.</priority>",
  "  <workspace_hygiene>Ensure .gitignore excludes .codegraph/ and .codebase-memory/ when they are created.</workspace_hygiene>",
  '  <server name="codegraph">',
  "    <role>Pre-built local code index.</role>",
  "  </server>",
  '  <server name="codebase-memory-mcp">',
  "    <role>Persistent repository-level knowledge graph.</role>",
  "  </server>",
  "</mcp_guidance>",
].join("\n")

describe("AgentExecutionFlow - MCP 策略指引折叠项", () => {
  afterEach(cleanup)

  it("在 System Prompt 下方独立分组，折叠项与其他分段同构并展示 XML 原文", () => {
    const step = buildSystemStep([
      { name: "harness:identity", text: "<identity>Yonah</identity>" },
      { name: "agent:mcp-guidance", text: MCP_GUIDANCE_TEXT },
    ])

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={vi.fn()} />,
    )

    // 独立分组：Plug 图标 + MCP Guidance 文案（与 settings 侧栏 MCP 分区同图标）
    const mcpGroup = container.querySelector(".agent-execution-flow-mcp-guidance")
    expect(mcpGroup).not.toBeNull()
    expect(mcpGroup?.querySelector(".lucide-plug")).not.toBeNull()
    expect(screen.getByText("MCP Guidance")).toBeDefined()

    // 折叠项与其他分段同构：summary 为段名，正文为完整 XML 原文
    expect(screen.getAllByText("agent:mcp-guidance")).toHaveLength(1)
    expect(screen.getByText(/<mcp_guidance>/)).toBeDefined()
    expect(screen.getByText(/<priority>/)).toBeDefined()
    expect(screen.getByText(/<workspace_hygiene>/)).toBeDefined()
    expect(screen.getByText(/<server name="codegraph">/)).toBeDefined()
    expect(screen.getByText(/<server name="codebase-memory-mcp">/)).toBeDefined()

    // 位置：System Prompt 分组之后
    const systemPromptHeader = screen
      .getAllByText("System Prompt")
      .find((el) => el.closest(".agent-execution-flow-system-content"))
    if (!systemPromptHeader) {
      throw new Error("System Prompt group header not found")
    }
    expect(
      systemPromptHeader.compareDocumentPosition(mcpGroup as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it("无 MCP 指引段时不渲染该分组", () => {
    const step = buildSystemStep([{ name: "harness:identity", text: "<identity>Yonah</identity>" }])

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={vi.fn()} />,
    )

    expect(container.querySelector(".agent-execution-flow-mcp-guidance")).toBeNull()
    expect(screen.queryByText("MCP Guidance")).toBeNull()
  })
})
