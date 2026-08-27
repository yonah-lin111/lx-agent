// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import type { ChatMessage } from "@/features/agent/types"
import { AgentModelSwitchItem } from "@/features/agent/components/AgentMessageList/AgentMessageItem/AgentModelSwitchItem"

describe("AgentModelSwitchItem", () => {
  beforeEach(() => {
    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  })
  it("渲染初始模型条目并支持展开查看厂商提示词", () => {
    const message: ChatMessage = {
      id: "m1",
      role: "modelSwitch",
      isStreaming: false,
      model: "gpt-4o",
      provider: "openai",
      family: "gpt",
      instructions: "## Custom GPT Instructions\nDo good things.",
      isInitial: true,
      blocks: [],
    }

    render(<AgentModelSwitchItem message={message} />)

    // 检查初始模型标题
    expect(screen.getByText(/Initial Model: gpt-4o|对话初始模型：gpt-4o/i)).not.toBeNull()
    expect(screen.getByText(/PROVIDER openai/)).not.toBeNull()
    expect(screen.getByText(/FAMILY GPT/)).not.toBeNull()

    // 展开查看
    const btn = screen.getByRole("button")
    fireEvent.click(btn)

    expect(screen.getByText(/Do good things/)).not.toBeNull()
  })

  it("渲染切换模型条目", () => {
    const message: ChatMessage = {
      id: "m2",
      role: "modelSwitch",
      isStreaming: false,
      model: "claude-3-5-sonnet",
      provider: "anthropic",
      family: "claude",
      instructions: "## Claude specific guidelines",
      isInitial: false,
      blocks: [],
    }

    render(<AgentModelSwitchItem message={message} />)

    expect(
      screen.getByText(/Switched Model: claude-3-5-sonnet|已切换模型为：claude-3-5-sonnet/i),
    ).not.toBeNull()
  })
})
