// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import { PARALLEL_BATCH_COLORS } from "@/features/agent/components/AgentExecutionFlowList/types"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"

describe("AgentExecutionFlowItem - 并行工具调用样式与 Token 结算测试", () => {
  afterEach(() => {
    cleanup()
  })

  describe("1. 批次颜色池 (PARALLEL_BATCH_COLORS)", () => {
    it("颜色池中不包含任何红色/玫瑰红系色值 (避免被误认为错误状态)", () => {
      for (const color of PARALLEL_BATCH_COLORS) {
        expect(color).not.toMatch(/rose|red|danger|error/i)
      }
    })
  })

  describe("2. 单步组件 (AgentExecutionFlowItem) 并行 Token 展示与文案标注", () => {
    it("并行调用非末尾项（如 1/2）无 tokens 时，不渲染 Token 指标栏", () => {
      const step: ExecutionStep = {
        id: "step-parallel-1",
        messageId: "msg-1",
        turnIndex: 1,
        stepIndex: 1,
        kind: "tool",
        title: "read_file",
        status: "done",
        timestamp: 1000,
        parallel: {
          index: 1,
          total: 2,
          batchId: "batch-1",
          batchIndex: 0,
        },
        tokens: undefined,
      }

      render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

      // 应当渲染右侧并行标记
      const parallelBadge = screen.getByTestId("flow-item-parallel")
      expect(parallelBadge).toBeDefined()
      expect(parallelBadge.textContent).toBe("Parallel 1/2")

      // 不应渲染任何 token 指标
      expect(screen.queryByText(/IN /)).toBeNull()
      expect(screen.queryByTestId("flow-item-parallel-token-total")).toBeNull()
    })

    it("并行调用末尾项（如 2/2）且持有 tokens 时，展示 Token 指标并标注并行总计文案", () => {
      const step: ExecutionStep = {
        id: "step-parallel-2",
        messageId: "msg-1",
        turnIndex: 1,
        stepIndex: 2,
        kind: "tool",
        title: "write_file",
        status: "done",
        timestamp: 1050,
        parallel: {
          index: 2,
          total: 2,
          batchId: "batch-1",
          batchIndex: 0,
        },
        tokens: {
          input: 4200,
          output: 180,
          cacheRead: 500,
          total: 4380,
        },
      }

      render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

      // 应当渲染右侧并行标记
      const parallelBadge = screen.getByTestId("flow-item-parallel")
      expect(parallelBadge).toBeDefined()
      expect(parallelBadge.textContent).toBe("Parallel 2/2")

      // 应当渲染 Token 指标
      expect(screen.getByText("IN 4.2k")).toBeDefined()
      expect(screen.getByText("OUT 180")).toBeDefined()
      expect(screen.getByText("CACHE 500")).toBeDefined()

      // 必须渲染并行总计标注文案
      const tokenTotalBadge = screen.getByTestId("flow-item-parallel-token-total")
      expect(tokenTotalBadge).toBeDefined()
      expect(tokenTotalBadge.textContent).toContain("Batch Total")
    })

    it("非并行调用的普通工具调用即使持有 tokens，也不渲染并行总计文案", () => {
      const step: ExecutionStep = {
        id: "step-single-tool",
        messageId: "msg-1",
        turnIndex: 1,
        stepIndex: 1,
        kind: "tool",
        title: "read_file",
        status: "done",
        timestamp: 1000,
        tokens: {
          input: 1000,
          output: 50,
          total: 1050,
        },
      }

      render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

      expect(screen.getByText("IN 1.0k")).toBeDefined()
      expect(screen.queryByTestId("flow-item-parallel-token-total")).toBeNull()
    })

    it("小宽度容器下，左侧 token 区域配置 truncate 与弹性收缩，Parallel 容器保持 shrink-0 不被挤出", () => {
      const step: ExecutionStep = {
        id: "step-parallel-narrow",
        messageId: "msg-1",
        turnIndex: 1,
        stepIndex: 5,
        kind: "tool",
        title: "read",
        status: "done",
        timestamp: 1050,
        parallel: {
          index: 5,
          total: 5,
          batchId: "batch-1",
          batchIndex: 0,
        },
        tokens: {
          input: 31000,
          output: 1100,
          total: 32100,
        },
      }

      const { container } = render(
        <AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />,
      )

      const footer = container.querySelector(".agent-execution-flow-step-footer")
      expect(footer).toBeDefined()
      expect(footer?.className).toContain("overflow-hidden")

      // 左侧容器必须支持弹性收缩与溢出隐藏
      const leftContainer = footer?.firstElementChild as HTMLElement
      expect(leftContainer).toBeDefined()
      expect(leftContainer.className).toContain("min-w-0")
      expect(leftContainer.className).toContain("flex-1")
      expect(leftContainer.className).toContain("overflow-hidden")

      // token 文本节点必须具有 truncate 与 max-w-full
      const tokenSpan = leftContainer.querySelector("span.truncate")
      expect(tokenSpan).toBeDefined()
      expect(tokenSpan?.className).toContain("max-w-full")
      expect(tokenSpan?.className).toContain("min-w-0")

      // 右侧 Parallel 容器必须包含 shrink-0 与 whitespace-nowrap，严禁被压缩或折行挤出
      const parallelBadge = screen.getByTestId("flow-item-parallel")
      expect(parallelBadge.className).toContain("shrink-0")
      expect(parallelBadge.className).toContain("whitespace-nowrap")
    })
  })

  describe("3. 完整列表集成 (AgentExecutionFlowList)", () => {
    it("并发工具调用在列表中每一项都展示整批共享的 Token 指标与并行总计文案", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "测试并发调用" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [
            {
              kind: "toolCall",
              toolCallId: "c1",
              toolName: "search",
              args: { q: "test1" },
              status: "done",
            },
            {
              kind: "toolCall",
              toolCallId: "c2",
              toolName: "search",
              args: { q: "test2" },
              status: "done",
            },
          ],
          isStreaming: false,
          timestamp: 1010,
          usage: {
            input: 5000,
            output: 100,
            cacheRead: 200,
            cacheWrite: 0,
            totalTokens: 5100,
          },
        },
      ]

      const { container } = render(
        <AgentExecutionFlowList messages={messages} isStreaming={false} />,
      )

      // 展开 Execute Group
      const groupHeader = container.querySelector(".agent-execution-flow-group-header")
      if (groupHeader) {
        fireEvent.click(groupHeader)
      }

      const parallelBadges = screen.getAllByTestId("flow-item-parallel")
      expect(parallelBadges).toHaveLength(2)
      expect(parallelBadges[0].textContent).toBe("Parallel 1/2")
      expect(parallelBadges[1].textContent).toBe("Parallel 2/2")

      // 整批共享同一份请求用量：批次内每一项都标注并行总计
      const tokenTotalBadges = screen.getAllByTestId("flow-item-parallel-token-total")
      expect(tokenTotalBadges).toHaveLength(2)
      for (const badge of tokenTotalBadges) {
        expect(badge.textContent).toContain("Batch Total")
      }

      // 两个 tool 步骤项的 footer 均包含共享 token 指标
      const toolSteps = container.querySelectorAll(".agent-execution-flow-step--tool")
      expect(toolSteps).toHaveLength(2)
      expect(
        within(toolSteps[0] as HTMLElement).getByTestId("flow-item-parallel-token-total"),
      ).toBeDefined()
      expect(within(toolSteps[0] as HTMLElement).getByText("IN 5.0k")).toBeDefined()
      expect(
        within(toolSteps[1] as HTMLElement).getByTestId("flow-item-parallel-token-total"),
      ).toBeDefined()
      expect(within(toolSteps[1] as HTMLElement).getByText("IN 5.0k")).toBeDefined()
    })
  })
})
