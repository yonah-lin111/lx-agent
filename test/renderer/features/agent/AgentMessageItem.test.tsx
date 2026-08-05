// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AgentMessageItem } from "@/features/agent/components/AgentMessageItem"
import type { ChatMessage } from "@/features/agent/types"

// 构造用户消息展示条目。
const userMessage = (id: string, text: string): ChatMessage => ({
  id,
  role: "user",
  blocks: [{ kind: "text", text }],
  isStreaming: false,
})

describe("AgentMessageItem", () => {
  beforeEach(() => {
    cleanup()
  })

  it("用户短消息不应该显示折叠/展开按钮", () => {
    const message = userMessage("1", "这是一条短消息")

    render(<AgentMessageItem message={message} />)

    expect(screen.queryByRole("button", { name: "展开内容" })).toBeNull()
    expect(screen.queryByRole("button", { name: "折叠内容" })).toBeNull()
    expect(screen.getByText("这是一条短消息")).not.toBeNull()
    expect(screen.getByRole("button", { name: "编辑消息" })).not.toBeNull()
  })

  it("用户长消息（多于3行）折叠并提供展开/折叠切换功能", () => {
    const longContent = "第一行\n第二行\n第三行\n第四行\n第五行"
    const message = userMessage("2", longContent)

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
    const message = userMessage("3", "原始内容")

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

  it("将连续的同名 read 工具调用合并为顿号分隔的路径列表", () => {
    const message: ChatMessage = {
      id: "4",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "tool-1",
          toolName: "read",
          args: { path: "/Users/yonah/projects/agent/pi-main" },
          status: "error",
        },
        {
          kind: "toolCall",
          toolCallId: "tool-2",
          toolName: "read",
          args: { path: "/Users/yonah/projects/agent/lx-agent" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "tool-3",
          toolName: "read",
          args: { path: "/Users/yonah/projects/agent/codex-main" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Read")).toHaveLength(1)
    expect(
      screen.getByText(
        "/Users/.../agent/pi-main、/Users/.../agent/lx-agent、/Users/.../agent/codex-main",
      ),
    ).not.toBeNull()
  })

  it("将连续的同名 ls 工具调用合并为分号分隔的路径列表", () => {
    const message: ChatMessage = {
      id: "6",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "ls-1",
          toolName: "ls",
          args: { path: "/src" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "ls-2",
          toolName: "ls",
          args: { path: "/lib" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Ls")).toHaveLength(1)
    expect(screen.getByText("/src ; /lib")).not.toBeNull()
  })

  it("将连续的同名 grep 工具调用合并为竖线分隔的摘要", () => {
    const message: ChatMessage = {
      id: "7",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "grep-1",
          toolName: "grep",
          args: { pattern: "keyword", path: "/src/a.ts" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "grep-2",
          toolName: "grep",
          args: { pattern: "keyword", path: "/lib/b.ts" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Grep")).toHaveLength(1)
    expect(screen.getByText("keyword /src/a.ts | keyword /lib/b.ts")).not.toBeNull()
  })

  it("将连续的同名 find 工具调用合并为逗号分隔的摘要", () => {
    const message: ChatMessage = {
      id: "8",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "find-1",
          toolName: "find",
          args: { pattern: "*.ts", path: "/src" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "find-2",
          toolName: "find",
          args: { pattern: "*.ts", path: "/lib" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Find")).toHaveLength(1)
    expect(screen.getByText("*.ts /src , *.ts /lib")).not.toBeNull()
  })

  it("将连续的同名 bash 工具调用合并为与号分隔的命令列表", () => {
    const message: ChatMessage = {
      id: "9",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "bash-1",
          toolName: "bash",
          args: { command: "npm test" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "bash-2",
          toolName: "bash",
          args: { command: "npm run build" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Bash")).toHaveLength(1)
    expect(screen.getByText("npm test & npm run build")).not.toBeNull()
  })

  it("不同工具的连续调用不合并，各自成行", () => {
    const message: ChatMessage = {
      id: "10",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "ls-1",
          toolName: "ls",
          args: { path: "/src" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "grep-1",
          toolName: "grep",
          args: { pattern: "x", path: "/src" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Ls")).toHaveLength(1)
    expect(screen.getAllByText("Grep")).toHaveLength(1)
    expect(screen.getByText("ls /src")).not.toBeNull()
    expect(screen.getByText("grep x /src")).not.toBeNull()
  })

  it("read 被其他工具打断后应渲染新的 read 分组", () => {
    const message: ChatMessage = {
      id: "5",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "read-1",
          toolName: "read",
          args: { path: "/tmp/first.ts" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "time-1",
          toolName: "time",
          args: {},
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "read-2",
          toolName: "read",
          args: { path: "/tmp/second.ts" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getAllByText("Read")).toHaveLength(2)
    expect(screen.getAllByText("/tmp/first.ts")).not.toHaveLength(0)
    expect(screen.getAllByText("/tmp/second.ts")).not.toHaveLength(0)
  })
})
