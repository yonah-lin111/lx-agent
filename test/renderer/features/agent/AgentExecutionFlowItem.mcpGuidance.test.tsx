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

describe("AgentExecutionFlow - MCP 策略指引折叠块", () => {
  afterEach(cleanup)

  it("system item 独立渲染 MCP Guidance 折叠块与各 server 子折叠项", () => {
    const step = buildSystemStep([
      { name: "harness:identity", text: "<identity>Yonah</identity>" },
      { name: "agent:mcp-guidance", text: MCP_GUIDANCE_TEXT },
    ])

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={vi.fn()} />,
    )

    // 独立折叠块入口与标题
    expect(container.querySelector(".agent-execution-flow-mcp-guidance")).not.toBeNull()
    expect(screen.getByText("MCP Guidance")).toBeDefined()
    expect(screen.getByText("agent:mcp-guidance")).toBeDefined()

    // 各 server 子折叠项
    expect(screen.getByText("codegraph")).toBeDefined()
    expect(screen.getByText("codebase-memory-mcp")).toBeDefined()
    expect(screen.getByText(/Pre-built local code index/)).toBeDefined()
    expect(screen.getByText(/Persistent repository-level knowledge graph/)).toBeDefined()

    // workspace_hygiene 与 priority 一同展示在折叠块内
    expect(
      screen.getByText(/\.gitignore excludes \.codegraph\/ and \.codebase-memory\//),
    ).toBeDefined()

    // 指引段不在通用 System Prompt 列表中重复出现
    expect(screen.getAllByText("agent:mcp-guidance")).toHaveLength(1)
    expect(screen.getAllByText(/PRIMARY strategy/)).toHaveLength(1)

    // 普通分段照常展示
    expect(screen.getByText("harness:identity")).toBeDefined()
  })

  it("无 MCP 指引段时不渲染该折叠块", () => {
    const step = buildSystemStep([{ name: "harness:identity", text: "<identity>Yonah</identity>" }])

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={vi.fn()} />,
    )

    expect(container.querySelector(".agent-execution-flow-mcp-guidance")).toBeNull()
    expect(screen.queryByText("MCP Guidance")).toBeNull()
  })

  it("指引段无法解析出 server 子块时回退展示整段原文", () => {
    const step = buildSystemStep([
      { name: "agent:mcp-guidance", text: "<mcp_guidance>raw fallback payload</mcp_guidance>" },
    ])

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={true} onToggleExpand={vi.fn()} />,
    )

    expect(container.querySelector(".agent-execution-flow-mcp-guidance")).not.toBeNull()
    expect(screen.getByText(/raw fallback payload/)).toBeDefined()
    expect(screen.queryByText("codegraph")).toBeNull()
  })
})
