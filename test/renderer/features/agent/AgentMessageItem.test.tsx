// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import type { AgentMessage } from "@/features/agent/types"

describe("AgentMessageItem", () => {
  beforeEach(() => {
    cleanup()
  })

  it("用户短消息不应该显示折叠/展开按钮", () => {
    const message: AgentMessage = {
      id: "1",
      role: "user",
      content: "这是一条短消息",
      createdAt: Date.now(),
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.queryByRole("button", { name: "展开内容" })).toBeNull()
    expect(screen.queryByRole("button", { name: "折叠内容" })).toBeNull()
    expect(screen.getByText("这是一条短消息")).not.toBeNull()
    expect(screen.getByRole("button", { name: "编辑消息" })).not.toBeNull()
  })

  it("用户长消息（多于3行）折叠并提供展开/折叠切换功能", () => {
    const longContent = "第一行\n第二行\n第三行\n第四行\n第五行"
    const message: AgentMessage = {
      id: "2",
      role: "user",
      content: longContent,
      createdAt: Date.now(),
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

  it("点击编辑按钮切换输入框，并通过右下角发送按钮提交编辑", () => {
    const onEdit = vi.fn()
    const message: AgentMessage = {
      id: "3",
      role: "user",
      content: "原始内容",
      createdAt: Date.now(),
    }

    render(<AgentMessageItem message={message} onEdit={onEdit} />)

    const editBtn = screen.getByRole("button", { name: "编辑消息" })
    expect(editBtn).not.toBeNull()

    // 点击编辑按钮
    fireEvent.click(editBtn)

    // 此时显示 textarea 输入框和发送按钮
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toBe("原始内容")

    // 修改内容
    fireEvent.change(textarea, { target: { value: "修改后的内容" } })

    // 点击右下角发送按钮
    const sendBtn = screen.getByRole("button", { name: "发送消息" })
    fireEvent.click(sendBtn)

    expect(onEdit).toHaveBeenCalledWith("3", "修改后的内容")
  })
})
