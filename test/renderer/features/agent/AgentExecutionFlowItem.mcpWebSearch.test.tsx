// @vitest-environment jsdom
import { cleanup, render, renderHook, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { TOOL_SOURCE_CATEGORIES } from "@/features/agent/components/AgentExecutionFlowList/FlowItemSystemContent"
import { useFlowStats } from "@/features/agent/components/AgentExecutionFlowList/hooks/useFlowStats"
import { useFlowSteps } from "@/features/agent/components/AgentExecutionFlowList/hooks/useFlowSteps"
import {
  getKindMeta,
  isWebSearchTool,
} from "@/features/agent/components/AgentExecutionFlowList/types"
import { AgentMcpCallBlock } from "@/features/agent/components/blocks/AgentMcpCallBlock"
import { AgentWebSearchBlock } from "@/features/agent/components/blocks/AgentWebSearchBlock"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"

describe("AgentExecutionFlow - MCP & Web Search 标签与分类测试", () => {
  afterEach(cleanup)

  it("isWebSearchTool 能准确识别 web_search 与 webfetch", () => {
    expect(isWebSearchTool("web_search")).toBe(true)
    expect(isWebSearchTool("webfetch")).toBe(true)
    expect(isWebSearchTool("read")).toBe(false)
    expect(isWebSearchTool("mcp__server__tool")).toBe(false)
  })

  it("getKindMeta 为 MCP 工具返回 teal 配色与 MCP 标签 key", () => {
    const step: ExecutionStep = {
      id: "step-mcp-1",
      turnIndex: 1,
      stepIndex: 1,
      kind: "tool",
      title: "mcp__github__create_issue",
      status: "done",
      toolContent: {
        toolName: "mcp__github__create_issue",
        toolCallId: "call-1",
        args: {},
      },
    }

    const meta = getKindMeta(step)
    expect(meta.tagColor).toBe("teal")
    expect(meta.labelKey).toBe("agent.kindMcp")
    expect(meta.textColor).toBe("text-teal-300")
  })

  it("getKindMeta 为 Web Search 工具返回 sky 配色与 Web Search 标签 key", () => {
    const step: ExecutionStep = {
      id: "step-web-1",
      turnIndex: 1,
      stepIndex: 2,
      kind: "tool",
      title: "web_search",
      status: "done",
      toolContent: {
        toolName: "web_search",
        toolCallId: "call-2",
        args: {},
      },
    }

    const meta = getKindMeta(step)
    expect(meta.tagColor).toBe("sky")
    expect(meta.labelKey).toBe("agent.kindWebSearch")
    expect(meta.textColor).toBe("text-sky-300")
  })

  it("getKindMeta 为常规工具返回 amber 配色与 Tool 标签 key", () => {
    const step: ExecutionStep = {
      id: "step-tool-1",
      turnIndex: 1,
      stepIndex: 3,
      kind: "tool",
      title: "read",
      status: "done",
      toolContent: {
        toolName: "read",
        toolCallId: "call-3",
        args: {},
      },
    }

    const meta = getKindMeta(step)
    expect(meta.tagColor).toBe("amber")
    expect(meta.labelKey).toBe("agent.kindTool")
    expect(meta.textColor).toBe("text-amber-300")
  })

  it("AgentExecutionFlowItem 渲染 MCP 专属标签", () => {
    const step: ExecutionStep = {
      id: "step-mcp-render",
      turnIndex: 1,
      stepIndex: 1,
      kind: "tool",
      title: "mcp__sqlite__query",
      status: "done",
      toolContent: {
        toolName: "mcp__sqlite__query",
        toolCallId: "call-mcp",
        args: {},
      },
    }

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />,
    )

    const itemEl = container.querySelector(".agent-execution-flow-step")
    expect(itemEl?.getAttribute("data-tag-color")).toBe("teal")
    expect(screen.getByText("MCP")).toBeDefined()
  })

  it("AgentExecutionFlowItem 渲染 Web Search 专属标签", () => {
    const step: ExecutionStep = {
      id: "step-web-render",
      turnIndex: 1,
      stepIndex: 2,
      kind: "tool",
      title: "web_search",
      status: "done",
      toolContent: {
        toolName: "web_search",
        toolCallId: "call-web",
        args: {},
      },
    }

    const { container } = render(
      <AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />,
    )

    const itemEl = container.querySelector(".agent-execution-flow-step")
    expect(itemEl?.getAttribute("data-tag-color")).toBe("sky")
    expect(screen.getByText(/Web Search|联网搜索/)).toBeDefined()
  })

  it("useFlowStats 对 tool、mcp、webSearch 进行正交互斥计数，calls 为总聚合", () => {
    const steps: ExecutionStep[] = [
      {
        id: "step-1",
        turnIndex: 1,
        stepIndex: 1,
        kind: "tool",
        title: "read",
        status: "done",
        toolContent: { toolName: "read", toolCallId: "c1", args: {} },
      },
      {
        id: "step-2",
        turnIndex: 1,
        stepIndex: 2,
        kind: "tool",
        title: "mcp__fs__list",
        status: "done",
        toolContent: { toolName: "mcp__fs__list", toolCallId: "c2", args: {} },
      },
      {
        id: "step-3",
        turnIndex: 1,
        stepIndex: 3,
        kind: "tool",
        title: "web_search",
        status: "done",
        toolContent: { toolName: "web_search", toolCallId: "c3", args: {} },
      },
      {
        id: "step-4",
        turnIndex: 1,
        stepIndex: 4,
        kind: "subagent",
        title: "task",
        status: "done",
        subagentContent: { name: "researcher" },
      },
    ]

    const { result } = renderHook(() =>
      useFlowStats({
        steps,
        isStreaming: false,
        maxTurn: 1,
      }),
    )

    expect(result.current.filterCounts.tool).toBe(1)
    expect(result.current.filterCounts.mcp).toBe(1)
    expect(result.current.filterCounts.webSearch).toBe(1)
    expect(result.current.filterCounts.subagent).toBe(1)
    expect(result.current.filterCounts.calls).toBe(4)
    expect(result.current.filterCounts.all).toBe(4)
  })

  it("useFlowSteps 能正确按 mcp、webSearch 和正交互斥的 tool 进行过滤", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        timestamp: 1000,
        isStreaming: false,
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "c1",
            toolName: "read",
            args: {},
            status: "done",
          },
          {
            kind: "toolCall",
            toolCallId: "c2",
            toolName: "mcp__server__method",
            args: {},
            status: "done",
          },
          {
            kind: "toolCall",
            toolCallId: "c3",
            toolName: "web_search",
            args: {},
            status: "done",
          },
        ],
      },
    ]

    const { result: mcpResult } = renderHook(() =>
      useFlowSteps({
        messages,
        promptAssembly: null,
        isStreaming: false,
        activeFilter: "mcp",
      }),
    )
    expect(mcpResult.current.filteredSteps.map((s) => s.toolContent?.toolName)).toEqual([
      "mcp__server__method",
    ])

    const { result: webResult } = renderHook(() =>
      useFlowSteps({
        messages,
        promptAssembly: null,
        isStreaming: false,
        activeFilter: "webSearch",
      }),
    )
    expect(webResult.current.filteredSteps.map((s) => s.toolContent?.toolName)).toEqual([
      "web_search",
    ])

    const { result: toolResult } = renderHook(() =>
      useFlowSteps({
        messages,
        promptAssembly: null,
        isStreaming: false,
        activeFilter: "tool",
      }),
    )
    expect(toolResult.current.filteredSteps.map((s) => s.toolContent?.toolName)).toEqual(["read"])
  })
})

describe("AgentExecutionFlow - MCP 标题解析与配色", () => {
  afterEach(cleanup)

  it("按 mcp__server__tool 解析并去掉 MCP 前缀", () => {
    const step: ExecutionStep = {
      id: "step-mcp-title",
      turnIndex: 1,
      stepIndex: 1,
      kind: "tool",
      title: "mcp__codebase-memory-mcp__list_projects",
      status: "done",
      toolContent: {
        toolName: "mcp__codebase-memory-mcp__list_projects",
        toolCallId: "call-title",
        args: {},
      },
    }

    render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

    expect(screen.getByText("codebase-memory-mcp · list_projects")).toBeDefined()
    expect(screen.queryByText(/MCP ·/)).toBeNull()
    expect(screen.queryByText(/__codebase/)).toBeNull()
  })

  it("mcp__server 单段形态不重复渲染名称", () => {
    const step: ExecutionStep = {
      id: "step-mcp-solo",
      turnIndex: 1,
      stepIndex: 2,
      kind: "tool",
      title: "mcp__solo",
      status: "done",
      toolContent: {
        toolName: "mcp__solo",
        toolCallId: "call-solo",
        args: {},
      },
    }

    render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

    expect(screen.getByText("solo")).toBeDefined()
  })

  it("modelSwitch 改用 gray tag + cyan 文字，不再占用 teal", () => {
    const step: ExecutionStep = {
      id: "step-model-switch",
      turnIndex: 1,
      stepIndex: 3,
      kind: "modelSwitch",
      title: "Model switched",
      status: "done",
    }

    const meta = getKindMeta(step)
    expect(meta.tagColor).toBe("gray")
    expect(meta.textColor).toBe("text-cyan-300")
  })

  it("system item 工具分类圆点：MCP teal / Web Search sky", () => {
    expect(TOOL_SOURCE_CATEGORIES.mcp.dotColor).toBe("bg-teal-400")
    expect(TOOL_SOURCE_CATEGORIES.webSearch.dotColor).toBe("bg-sky-400")
  })
})

describe("AgentExecutionFlow - 消息流 MCP & Web Search 标识色同步", () => {
  afterEach(cleanup)

  it("AgentMcpCallBlock 名称使用 teal 标识色", () => {
    const { container } = render(
      <AgentMcpCallBlock
        toolCalls={[
          {
            kind: "toolCall",
            toolCallId: "mcp-call-1",
            toolName: "mcp__codebase-memory-mcp__list_projects",
            args: {},
            status: "done",
          },
        ]}
      />,
    )
    expect(container.querySelector(".agent-mcp-name")?.className).toContain("text-teal-300")
  })

  it("AgentWebSearchBlock 名称使用 sky 标识色", () => {
    const { container } = render(
      <AgentWebSearchBlock
        toolCalls={[
          {
            kind: "toolCall",
            toolCallId: "web-call-1",
            toolName: "web_search",
            args: { query: "vitest" },
            status: "done",
          },
        ]}
      />,
    )
    expect(container.querySelector(".agent-web-search-name")?.className).toContain("text-sky-300")
  })
})
