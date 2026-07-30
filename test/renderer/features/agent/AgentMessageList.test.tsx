// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageList } from "@/features/agent/components/AgentMessageList"
import type { AgentMessage } from "@/features/agent/types"

describe("AgentMessageList", () => {
  beforeEach(() => {
    cleanup()
    window.HTMLElement.prototype.scrollIntoView = vi.fn()
  })

  it("消息列表中同一时间只能出现一个编辑输入框", () => {
    const messages: AgentMessage[] = [
      { id: "msg-1", role: "user", content: "消息 1", createdAt: 1 },
      { id: "msg-2", role: "user", content: "消息 2", createdAt: 2 },
    ]

    render(<AgentMessageList messages={messages} onSelectPrompt={vi.fn()} />)

    const editBtns = screen.getAllByRole("button", { name: "编辑消息" })
    expect(editBtns.length).toBe(2)

    // 点击第一条消息的编辑按钮
    fireEvent.click(editBtns[0])

    let textareas = screen.getAllByRole("textbox")
    expect(textareas.length).toBe(1)
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("消息 1")

    // 点击第二条消息的编辑按钮
    const remainingEditBtns = screen.getAllByRole("button", { name: "编辑消息" })
    fireEvent.click(remainingEditBtns[0])

    textareas = screen.getAllByRole("textbox")
    // 确保页面上依然只有一个编辑输入框（针对消息 2）
    expect(textareas.length).toBe(1)
    expect((textareas[0] as HTMLTextAreaElement).value).toBe("消息 2")
  })
})
