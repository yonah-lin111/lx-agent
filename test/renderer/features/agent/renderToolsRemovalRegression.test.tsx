// @vitest-environment jsdom
import type { QuestionRequest } from "@shared/contracts/agent"
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { agentApi } from "@/features/agent/api/agentApi"
import { FlowItemQuestionContent } from "@/features/agent/components/AgentExecutionFlowList/FlowItemQuestionContent"
import { FlowItemToolContent } from "@/features/agent/components/AgentExecutionFlowList/FlowItemToolContent"
import { useMessageItemGroups } from "@/features/agent/components/AgentMessageList/AgentMessageItem/hooks/useMessageItemGroups"
import { AgentQuestionBlock } from "@/features/agent/components/blocks/AgentQuestionBlock"
import { sanitizeHtmlDocument } from "@/features/agent/components/visuals/sanitizeVisual"
import type { ChatBlock, ChatMessage, ExecutionToolContent } from "@/features/agent/types"

// jsdom 下 mock ResizeObserver
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

describe("Render Tools Removal & Question UI System Regression (Renderer)", () => {
  beforeEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe("1. 历史遗留 render 工具消息安全回退为通用工具", () => {
    it("FlowItemToolContent 对 render_svg / render_ascii / render_html 平稳降级为通用工具展示", () => {
      const legacyTools = ["render_svg", "render_ascii", "render_html"]

      for (const toolName of legacyTools) {
        const content: ExecutionToolContent = {
          toolName,
          args: { code: "legacy payload" },
          result: "legacy result",
          isError: false,
        }

        const { container } = render(<FlowItemToolContent content={content} />)

        // 绝不渲染原先的专用面板 class (.agent-execution-flow-tool-visual)
        expect(container.querySelector(".agent-execution-flow-tool-visual")).toBeNull()
        // 渲染通用工具的展示容器
        expect(container.querySelector(".agent-execution-flow-tool-generic")).not.toBeNull()
        // 正确显示参数内容
        expect(screen.getByText(/"legacy payload"/)).not.toBeNull()
        cleanup()
      }
    })

    it("useMessageItemGroups 将遗留 render 工具归类为普通 execution 组，不再产生 visual 组", () => {
      const message: ChatMessage = {
        id: "msg-1",
        role: "assistant",
        isStreaming: false,
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "c1",
            toolName: "render_svg",
            args: { svg: "<svg></svg>" },
            status: "done",
          },
          {
            kind: "toolCall",
            toolCallId: "c2",
            toolName: "render_ascii",
            args: { ascii: "+---+" },
            status: "done",
          },
          {
            kind: "toolCall",
            toolCallId: "c3",
            toolName: "render_html",
            args: { html: "<div></div>" },
            status: "done",
          },
        ],
      }

      const { result } = renderHook(() => useMessageItemGroups(message, []))

      // 所有的 render 工具全部并入普通的 execution 组，没有任何组 kind === "visual"
      const groups = result.current.executionGroups
      expect(groups.some((g) => (g as { kind: string }).kind === "visual")).toBe(false)
      expect(groups).toHaveLength(1)
      expect(groups[0].kind).toBe("execution")
      if (groups[0].kind === "execution") {
        expect(groups[0].blocks).toHaveLength(3)
      }
    })
  })

  describe("2. AgentQuestionBlock 无 content 纯文本与选项完整交互", () => {
    it("正常渲染提问卡片，完成单选作答并提交答案", async () => {
      const respondSpy = vi.spyOn(agentApi, "questionRespond").mockResolvedValue(undefined as never)

      const questionReq: QuestionRequest = {
        requestId: "req-clean-1",
        toolCallId: "tc-clean-1",
        sessionId: "sess-1",
        questions: [
          {
            question: "请选择架构方案：",
            header: "方案决策",
            options: [{ label: "方案 A", description: "轻量级方案" }, { label: "方案 B" }],
          },
        ],
      }

      const toolCall: ToolCallBlock = {
        kind: "toolCall",
        toolCallId: "tc-clean-1",
        toolName: "question",
        status: "running",
        question: questionReq,
        args: { questions: questionReq.questions },
      }

      const { container } = render(<AgentQuestionBlock toolCall={toolCall} />)

      expect(screen.getByText("请选择架构方案：")).not.toBeNull()
      expect(screen.getByText("方案 A")).not.toBeNull()
      expect(screen.getByText("轻量级方案")).not.toBeNull()
      // 确认无 SVG 元素或富图形容器
      expect(container.querySelector("svg.lucide-palette")).toBeNull()

      // 点击选项 A
      fireEvent.click(screen.getByText("方案 A"))

      // 点击提交按钮
      const submitBtn = screen.getByRole("button", { name: /Submit|提交/i })
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(submitBtn)

      expect(respondSpy).toHaveBeenCalledWith({
        requestId: "req-clean-1",
        answers: [{ question: "请选择架构方案：", answer: ["方案 A"] }],
      })
    })
  })

  describe("3. FlowItemQuestionContent 执行流内提问交互与只读回显", () => {
    it("在挂起状态下能正确输入并提交答案，且无 content 元素残留", () => {
      const respondSpy = vi.spyOn(agentApi, "questionRespond").mockResolvedValue(undefined as never)

      const content: ExecutionToolContent = {
        toolName: "question",
        question: {
          requestId: "req-flow-1",
          toolCallId: "tc-flow-1",
          sessionId: "sess-1",
          questions: [
            {
              question: "是否继续执行下一步？",
              options: [{ label: "是" }, { label: "否" }],
            },
          ],
        },
        args: {},
      }

      const { container } = render(<FlowItemQuestionContent content={content} />)
      expect(screen.getByText("是否继续执行下一步？")).not.toBeNull()
      expect(container.querySelector("iframe")).toBeNull()

      // 选中“是”并提交
      fireEvent.click(screen.getByText("是"))
      const submitBtn = screen.getByRole("button", { name: /提交|Submit/i })
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false)
      fireEvent.click(submitBtn)

      expect(respondSpy).toHaveBeenCalledWith({
        requestId: "req-flow-1",
        answers: [{ question: "是否继续执行下一步？", answer: ["是"] }],
      })
    })

    it("在已完成状态下能正确展示问答只读记录", () => {
      const content: ExecutionToolContent = {
        toolName: "question",
        args: {
          questions: [
            {
              question: "选择的部署环境？",
              options: [{ label: "生产" }, { label: "预发" }],
            },
          ],
        },
        answers: [{ question: "选择的部署环境？", answer: ["生产"] }],
        result: "User answered: 生产",
      }

      render(<FlowItemQuestionContent content={content} />)
      expect(screen.getByText("选择的部署环境？")).not.toBeNull()
      expect(screen.getByText("→ 生产")).not.toBeNull()
    })
  })

  describe("4. FrontDesign 依赖的 HTML 净化功能无损保留", () => {
    it("sanitizeHtmlDocument 保持严格过滤可执行恶意脚本，同时保留 UI 结构", () => {
      const rawHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Test UI</title></head>
          <body>
            <div class="p-4 bg-zinc-900 text-white">
              <h1 class="text-xl">前端原型测试</h1>
              <script>window.pwned = true;</script>
              <button onclick="alert(1)">按钮</button>
            </div>
          </body>
        </html>
      `
      const cleaned = sanitizeHtmlDocument(rawHtml)
      expect(cleaned).toContain("前端原型测试")
      expect(cleaned).toContain("bg-zinc-900")
      // 危险标签与内联事件已被坚决剥除
      expect(cleaned).not.toContain("<script")
      expect(cleaned).not.toContain("window.pwned")
      expect(cleaned).not.toContain("onclick")
    })
  })

  describe("5. React Hook 调用顺序与空问题边界稳定性", () => {
    it("FlowItemQuestionContent 在从无问题（空数组）更新到有问题时不发生 Hook 顺序改变崩溃", () => {
      const emptyContent: ExecutionToolContent = {
        toolName: "question",
        args: {},
      }

      const { rerender } = render(<FlowItemQuestionContent content={emptyContent} />)
      expect(screen.queryByText("是否有新任务？")).toBeNull()

      const filledContent: ExecutionToolContent = {
        toolName: "question",
        question: {
          requestId: "req-order-1",
          toolCallId: "tc-order-1",
          sessionId: "sess-1",
          questions: [{ question: "是否有新任务？", options: [{ label: "是" }] }],
        },
        args: {},
      }

      // 重新渲染，如果在有无问题间改变了 Hook 调用顺序，React 此时会直接抛错
      expect(() => {
        rerender(<FlowItemQuestionContent content={filledContent} />)
      }).not.toThrow()

      expect(screen.getByText("是否有新任务？")).not.toBeNull()
    })

    it("AgentQuestionBlock 在从无问题更新到有问题时不发生 Hook 顺序改变崩溃", () => {
      const emptyToolCall: ToolCallBlock = {
        kind: "toolCall",
        toolCallId: "tc-empty-1",
        toolName: "question",
        status: "running",
        args: {},
      }

      const { rerender } = render(<AgentQuestionBlock toolCall={emptyToolCall} />)
      expect(screen.queryByText("是否立即部署？")).toBeNull()

      const filledToolCall: ToolCallBlock = {
        kind: "toolCall",
        toolCallId: "tc-empty-1",
        toolName: "question",
        status: "running",
        question: {
          requestId: "req-order-2",
          toolCallId: "tc-empty-1",
          sessionId: "sess-1",
          questions: [{ question: "是否立即部署？", options: [{ label: "是" }] }],
        },
        args: {},
      }

      expect(() => {
        rerender(<AgentQuestionBlock toolCall={filledToolCall} />)
      }).not.toThrow()

      expect(screen.getByText("是否立即部署？")).not.toBeNull()
    })
  })
})
