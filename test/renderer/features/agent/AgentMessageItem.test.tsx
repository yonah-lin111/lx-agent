// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import type { AgentMessage } from "@/features/agent/types"

describe("AgentMessageItem", () => {
  it("用户短消息不应该显示折叠/展开按钮", () => {
    const message: AgentMessage = {
      id: "1",
      role: "user",
      content: "这是一条短消息",
      timestamp: Date.now(),
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.queryByRole("button", { name: "展开内容" })).toBeNull()
    expect(screen.queryByRole("button", { name: "折叠内容" })).toBeNull()
    expect(screen.getByText("这是一条短消息")).not.toBeNull()
  })

  it("用户长消息（多于3行）折叠并提供展开/折叠切换功能", () => {
    const longContent = "第一行\n第二行\n第三行\n第四行\n第五行"
    const message: AgentMessage = {
      id: "2",
      role: "user",
      content: longContent,
      timestamp: Date.now(),
    }

    // 在 jsdom 中模拟 scrollHeight 和 lineHeight
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 100 // 模拟 100px 超过 60px 阈值
      },
    })

    render(<AgentMessageItem message={message} />)

    const expandBtn = screen.getByRole("button", { name: "展开内容" })
    expect(expandBtn).not.toBeNull()

    // 点击展开按钮
    fireEvent.click(expandBtn)

    const collapseBtn = screen.getByRole("button", { name: "折叠内容" })
    expect(collapseBtn).not.toBeNull()
  })
})
