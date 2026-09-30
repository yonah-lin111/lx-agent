// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowGroup } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowGroup"
import { AgentExecutionFlowItem } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowItem"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import type { ChatMessage, ExecutionStep } from "@/features/agent/types"

describe("AgentExecutionFlow - Turn 底部左侧删除 QA 系统测试", () => {
  afterEach(() => {
    cleanup()
  })

  describe("1. 步骤项与折叠组瘦身隔离 (No delete button in step header)", () => {
    it("单个 AgentExecutionFlowItem 不再包含删除按钮", () => {
      const step: ExecutionStep = {
        id: "step-1",
        messageId: "msg-ai-1",
        turnIndex: 1,
        stepIndex: 1,
        kind: "assistant",
        title: "回答步骤",
        status: "done",
        timestamp: 1000,
        assistantContent: { text: "步骤内容" },
      }

      render(<AgentExecutionFlowItem step={step} isExpanded={false} onToggleExpand={vi.fn()} />)

      expect(screen.queryByRole("button", { name: /删除轮次|Delete turn/i })).toBeNull()
    })

    it("AgentExecutionFlowGroup 展开时子步骤头部也不包含删除按钮", () => {
      const step: ExecutionStep = {
        id: "step-tool-1",
        messageId: "msg-tool-1",
        turnIndex: 1,
        stepIndex: 1,
        kind: "tool",
        title: "read_file",
        status: "done",
        timestamp: 1000,
      }

      render(
        <AgentExecutionFlowGroup
          groupId="group-1"
          steps={[step]}
          isExpanded={true}
          onToggleExpand={vi.fn()}
          isStepExpanded={() => false}
          onToggleStepExpand={vi.fn()}
        />,
      )

      expect(screen.queryByRole("button", { name: /删除轮次|Delete turn/i })).toBeNull()
    })
  })

  describe("2. Turn 底部左侧位置与模型名称同行常驻显示 (Positioning & Visibility)", () => {
    const messages: ChatMessage[] = [
      {
        id: "u-1",
        role: "user",
        blocks: [{ kind: "text", text: "请列出目录" }],
        isStreaming: false,
        timestamp: 1000,
      },
      {
        id: "a-1",
        role: "assistant",
        model: "claude-3-5-sonnet",
        blocks: [{ kind: "text", text: "已列出目录。" }],
        usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
        isStreaming: false,
        timestamp: 2000,
      },
    ]

    it("删除按钮位于 Turn 底部左侧，且位于模型名称的左侧同行始终展示", () => {
      const onUndoOption = vi.fn()
      render(<AgentExecutionFlowList messages={messages} onUndoOption={onUndoOption} />)

      const turnSummary = screen.getByTestId("turn-summary-1")
      expect(turnSummary).not.toBeNull()

      // 删除按钮存在且直接常驻渲染在 turnSummary 内部
      const deleteBtn = within(turnSummary).getByRole("button", {
        name: /删除轮次|Delete turn/i,
      })
      expect(deleteBtn).not.toBeNull()

      // 模型名称药丸存在
      const modelPill = within(turnSummary).getByText(/claude|sonnet/i)
      expect(modelPill).not.toBeNull()

      // 验证 DOM 拓扑顺序：deleteBtn 在 modelPill 的前面（同行左侧）
      expect(
        deleteBtn.compareDocumentPosition(modelPill) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it("单次回调：点击删除弹出三选一菜单，点击菜单行精准触发", () => {
      const onUndoOption = vi.fn()
      render(<AgentExecutionFlowList messages={messages} onUndoOption={onUndoOption} />)

      const turnSummary = screen.getByTestId("turn-summary-1")
      const deleteBtn = within(turnSummary).getByRole("button", {
        name: /删除轮次|Delete turn/i,
      })

      // 点击删除按钮弹出与 /undo 一致的三选一菜单：三个选项与取消全部常显。
      fireEvent.click(deleteBtn)
      expect(document.querySelector('[data-option="revert_and_delete"]')).not.toBeNull()
      expect(document.querySelector('[data-option="revert_only"]')).not.toBeNull()
      expect(document.querySelector('[data-option="cancel"]')).not.toBeNull()
      const keepRow = document.querySelector<HTMLElement>('[data-option="delete_only"]')
      expect(keepRow).not.toBeNull()
      expect(onUndoOption).not.toHaveBeenCalled()
      fireEvent.mouseDown(keepRow!)

      expect(onUndoOption).toHaveBeenCalledTimes(1)
      expect(onUndoOption).toHaveBeenCalledWith("delete_only")
    })
  })

  describe("3. 保护机制与边缘场景 (Guards & Edge Cases)", () => {
    it("处于运行中 (isStreaming={true}) 时，当前轮次不展示删除按钮", () => {
      const messages: ChatMessage[] = [
        {
          id: "u-1",
          role: "user",
          blocks: [{ kind: "text", text: "生成中问题" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a-1",
          role: "assistant",
          blocks: [{ kind: "text", text: "正在生成回答..." }],
          isStreaming: true,
          timestamp: 2000,
        },
      ]

      render(
        <AgentExecutionFlowList messages={messages} isStreaming={true} onUndoOption={vi.fn()} />,
      )

      expect(screen.queryByRole("button", { name: /删除轮次|Delete turn/i })).toBeNull()
    })

    it("只读模式 readOnly={true} 下不展示删除按钮", () => {
      const messages: ChatMessage[] = [
        {
          id: "u-1",
          role: "user",
          blocks: [{ kind: "text", text: "用户问题" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a-1",
          role: "assistant",
          blocks: [{ kind: "text", text: "助手回答" }],
          isStreaming: false,
          timestamp: 2000,
        },
      ]

      render(<AgentExecutionFlowList messages={messages} readOnly={true} onUndoOption={vi.fn()} />)

      expect(screen.queryByRole("button", { name: /删除轮次|Delete turn/i })).toBeNull()
    })

    it("未传入 onUndoOption 时不展示删除按钮", () => {
      const messages: ChatMessage[] = [
        {
          id: "u-1",
          role: "user",
          blocks: [{ kind: "text", text: "用户问题" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a-1",
          role: "assistant",
          blocks: [{ kind: "text", text: "助手回答" }],
          isStreaming: false,
          timestamp: 2000,
        },
      ]

      render(<AgentExecutionFlowList messages={messages} />)

      expect(screen.queryByRole("button", { name: /删除轮次|Delete turn/i })).toBeNull()
    })

    it("异常中断 / error 轮次在底部左侧同样正常展示删除按钮", () => {
      const onUndoOption = vi.fn()
      const messages: ChatMessage[] = [
        {
          id: "u-1",
          role: "user",
          blocks: [{ kind: "text", text: "出错问题" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a-err",
          role: "assistant",
          error: "Connection timeout",
          stopReason: "error",
          blocks: [],
          isStreaming: false,
          timestamp: 2000,
        },
      ]

      render(<AgentExecutionFlowList messages={messages} onUndoOption={onUndoOption} />)

      const turnSummary = screen.getByTestId("turn-summary-1")
      const deleteBtn = within(turnSummary).getByRole("button", {
        name: /删除轮次|Delete turn/i,
      })
      expect(deleteBtn).not.toBeNull()

      fireEvent.click(deleteBtn)
      const keepRow = document.querySelector<HTMLElement>('[data-option="delete_only"]')
      expect(keepRow).not.toBeNull()
      fireEvent.mouseDown(keepRow!)

      expect(onUndoOption).toHaveBeenCalledWith("delete_only")
    })

    it("多轮对话中仅最后一条助手消息所在轮展示删除按钮，中间轮次不允许删除", () => {
      const onUndoOption = vi.fn()
      const messages: ChatMessage[] = [
        {
          id: "u-1",
          role: "user",
          blocks: [{ kind: "text", text: "第一轮" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a-1",
          role: "assistant",
          model: "claude-3-5-sonnet",
          blocks: [{ kind: "text", text: "第一轮回答" }],
          usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150 },
          isStreaming: false,
          timestamp: 2000,
        },
        {
          id: "u-2",
          role: "user",
          blocks: [{ kind: "text", text: "第二轮" }],
          isStreaming: false,
          timestamp: 3000,
        },
        {
          id: "a-2",
          role: "assistant",
          blocks: [{ kind: "text", text: "第二轮回答" }],
          isStreaming: false,
          timestamp: 4000,
        },
      ]

      render(<AgentExecutionFlowList messages={messages} onUndoOption={onUndoOption} />)

      // 整页只有最后一轮存在删除入口：第一轮汇总行存在但无删除按钮。
      const deleteButtons = screen.getAllByRole("button", { name: /删除轮次|Delete turn/i })
      expect(deleteButtons.length).toBe(1)
      const summary1 = screen.getByTestId("turn-summary-1")
      expect(within(summary1).queryByRole("button", { name: /删除轮次|Delete turn/i })).toBeNull()

      const summary2 = screen.getByTestId("turn-summary-2")
      const deleteBtn2 = within(summary2).getByRole("button", {
        name: /删除轮次|Delete turn/i,
      })

      // 删除第二轮
      fireEvent.click(deleteBtn2)
      const keepRow = document.querySelector<HTMLElement>('[data-option="delete_only"]')
      expect(keepRow).not.toBeNull()
      fireEvent.mouseDown(keepRow!)

      expect(onUndoOption).toHaveBeenCalledTimes(1)
      expect(onUndoOption).toHaveBeenCalledWith("delete_only")
    })

    it("尾部存在撤销摘要时，最后一条助手消息所在轮仍保留删除按钮", () => {
      const onUndoOption = vi.fn()
      const messages: ChatMessage[] = [
        {
          id: "u-1",
          role: "user",
          blocks: [{ kind: "text", text: "第一轮" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a-1",
          role: "assistant",
          model: "claude-3-5-sonnet",
          blocks: [{ kind: "text", text: "第一轮回答" }],
          isStreaming: false,
          timestamp: 2000,
        },
        {
          id: "undo-1",
          role: "undoSummary",
          blocks: [],
          isStreaming: false,
          timestamp: 3000,
        },
      ]

      render(<AgentExecutionFlowList messages={messages} onUndoOption={onUndoOption} />)

      const deleteBtn = screen.getByRole("button", { name: /删除轮次|Delete turn/i })
      expect(deleteBtn).not.toBeNull()

      fireEvent.click(deleteBtn)
      fireEvent.mouseDown(document.querySelector<HTMLElement>('[data-option="delete_only"]')!)
      expect(onUndoOption).toHaveBeenCalledWith("delete_only")
    })
  })
})
