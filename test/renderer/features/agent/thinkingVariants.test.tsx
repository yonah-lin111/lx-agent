// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentExecutionFlowList } from "@/features/agent/components/AgentExecutionFlowList/AgentExecutionFlowList"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageList"
import { AgentModelSelect } from "@/features/agent/components/AgentModelSelect"
import type { ChatMessage } from "@/features/agent/types"

// jsdom ResizeObserver stub
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

describe("Thinking Variants Display & Components", () => {
  beforeEach(() => {
    cleanup()
  })

  it("AgentModelSelect 应该在存在 variant 时在触发按钮上渲染思考等级徽章", () => {
    const onVariantChange = vi.fn()
    const { rerender } = render(
      <AgentModelSelect
        value="openai::gpt-4o"
        onChange={vi.fn()}
        options={[{ value: "openai::gpt-4o", label: "GPT-4o" }]}
      />,
    )

    // 未传入 variant 时不显示思考等级选择徽章
    expect(screen.queryByText("high")).toBeNull()

    // 传入 variant 时正确渲染徽章
    rerender(
      <AgentModelSelect
        value="openai::gpt-4o"
        onChange={vi.fn()}
        options={[{ value: "openai::gpt-4o", label: "GPT-4o" }]}
        variant="high"
        variants={["low", "medium", "high"]}
        onVariantChange={onVariantChange}
      />,
    )

    const badge = document.querySelector(".agent-model-variant-badge")
    expect(badge).not.toBeNull()
    expect(badge?.textContent).toContain("high")
    // 验证 badge 中不包含思考 icon
    expect(badge?.querySelector("svg")).toBeNull()
  })

  it("AgentModelSelect 直接点击配置了思考等级的模型时应选用默认等级", () => {
    const onChange = vi.fn()
    const onVariantChange = vi.fn()

    const options = [
      {
        label: "Anthropic",
        options: [
          {
            value: "anthropic::claude-3-7-sonnet",
            label: "Claude 3.7 Sonnet",
            variants: ["low", "medium", "high"],
            defaultVariant: "medium",
          },
        ],
      },
    ]

    render(
      <AgentModelSelect
        value="openai::gpt-4o"
        onChange={onChange}
        onVariantChange={onVariantChange}
        options={options}
      />,
    )

    // 点击主按钮展开下拉菜单
    const trigger = screen.getByRole("button", { name: /gpt-4o/i })
    fireEvent.click(trigger)

    // 应该看到选项
    const modelOption = screen.getByRole("option", { name: /claude 3\.7 sonnet/i })
    expect(modelOption).not.toBeNull()

    // 直接点击模型选项
    fireEvent.mouseDown(modelOption)

    expect(onChange).toHaveBeenCalledWith("anthropic::claude-3-7-sonnet", "medium")
    expect(onVariantChange).toHaveBeenCalledWith("medium")
  })

  it("AgentModelSelect 在二级菜单中选择特定思考等级时应正确回调", async () => {
    const onChange = vi.fn()
    const onVariantChange = vi.fn()

    const options = [
      {
        value: "anthropic::claude-3-7-sonnet",
        label: "Claude 3.7 Sonnet",
        variants: ["low", "medium", "high"],
        defaultVariant: "medium",
      },
    ]

    render(
      <AgentModelSelect
        value="anthropic::claude-3-7-sonnet"
        variant="low"
        onChange={onChange}
        onVariantChange={onVariantChange}
        options={options}
      />,
    )

    // 验证触发按钮展示了当前 variant "low"
    expect(screen.getByText("low")).not.toBeNull()

    // 展开下拉
    const trigger = screen.getByRole("button", { name: /claude 3\.7 sonnet/i })
    fireEvent.click(trigger)

    const modelOption = screen.getByRole("option", { name: /claude 3\.7 sonnet/i })
    // 鼠标移入触发展开 LxTooltip 二级菜单
    fireEvent.mouseEnter(modelOption)

    // 验证二级菜单标题文案为 Effort
    expect(await screen.findByText("Effort")).not.toBeNull()

    // 等待二级菜单选项出现
    const highItem = await screen.findByText("high")
    expect(highItem).not.toBeNull()

    // 点击 high
    fireEvent.click(highItem)

    expect(onChange).toHaveBeenCalledWith("anthropic::claude-3-7-sonnet", "high")
    expect(onVariantChange).toHaveBeenCalledWith("high")
  })

  it("AgentMessageItem 应该在顶部模型名称右侧显示思考等级", () => {
    const message: ChatMessage = {
      id: "msg-1",
      role: "assistant",
      model: "gpt-4o",
      variant: "xhigh",
      blocks: [{ kind: "text", text: "Here is the response" }],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} continuationMessages={[]} />)

    const variantEl = document.querySelector(".agent-message-variant")
    expect(variantEl).not.toBeNull()
    expect(variantEl?.textContent).toBe("xhigh")
    expect(variantEl?.className).toContain("text-sky-400/90")
  })

  it("AgentExecutionFlowList 应该在 turn 底部统计栏显示思考等级", () => {
    const messages: ChatMessage[] = [
      {
        id: "msg-user-1",
        role: "user",
        blocks: [{ kind: "text", text: "Run test" }],
        isStreaming: false,
        timestamp: 1000,
      },
      {
        id: "msg-assistant-1",
        role: "assistant",
        model: "gpt-4o",
        variant: "high",
        blocks: [
          { kind: "thinking", text: "Thinking deep..." },
          { kind: "text", text: "Completed task." },
        ],
        isStreaming: false,
        timestamp: 2000,
      },
    ]

    render(<AgentExecutionFlowList messages={messages} isStreaming={false} />)

    // 验证 turn summary 中存在 model 和 variant
    expect(screen.getByText("high")).not.toBeNull()
  })
})
