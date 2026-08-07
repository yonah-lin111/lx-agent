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

// 构造携带 clipboardData 的 copy 事件（jsdom 未实现 ClipboardEvent/DataTransfer）。
const makeCopyEvent = (): {
  event: Event
  dataTransfer: { setData: (type: string, data: string) => void; getData: (type: string) => string }
} => {
  const store = new Map<string, string>()
  const dataTransfer = {
    setData: (type: string, data: string) => store.set(type, data),
    getData: (type: string) => store.get(type) ?? "",
  }
  const event = new Event("copy", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: dataTransfer, configurable: true })
  return { event, dataTransfer }
}

// jsdom 未实现 ResizeObserver，用空实现代替（折叠动画相关组件依赖它）。
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe = (): void => undefined
    unobserve = (): void => undefined
    disconnect = (): void => undefined
  },
)

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

  it("双击/三击选中整条消息复制时剥离块边界换行伪影", () => {
    const text = "这个项目架构是怎么样的？"
    const { container } = render(<AgentMessageItem message={userMessage("copy-1", text)} />)

    const content = container.querySelector(".overflow-hidden") as HTMLDivElement
    const bubble = content.parentElement as HTMLDivElement
    const textNode = content.firstChild as Text

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEndAfter(content)

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => `${text}\n\n`,
    } as unknown as Selection)

    const { event, dataTransfer } = makeCopyEvent()
    bubble.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dataTransfer.getData("text/plain")).toBe(text)
    getSelection.mockRestore()
  })

  it("多行消息整体复制时保留内部换行，仅剥离末尾伪影", () => {
    const text = "第一行\n第二行"
    const { container } = render(<AgentMessageItem message={userMessage("copy-2", text)} />)

    const content = container.querySelector(".overflow-hidden") as HTMLDivElement
    const bubble = content.parentElement as HTMLDivElement
    const textNode = content.firstChild as Text

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEndAfter(content)

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => `${text}\n`,
    } as unknown as Selection)

    const { event, dataTransfer } = makeCopyEvent()
    bubble.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dataTransfer.getData("text/plain")).toBe(text)
    getSelection.mockRestore()
  })

  it("选区未结束于内容末尾时不做干预，走默认复制", () => {
    const text = "这个项目架构是怎么样的？"
    const { container } = render(<AgentMessageItem message={userMessage("copy-3", text)} />)

    const content = container.querySelector(".overflow-hidden") as HTMLDivElement
    const bubble = content.parentElement as HTMLDivElement
    const textNode = content.firstChild as Text

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEnd(textNode, text.length - 2)

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => text.slice(0, -2),
    } as unknown as Selection)

    const { event, dataTransfer } = makeCopyEvent()
    bubble.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(dataTransfer.getData("text/plain")).toBe("")
    getSelection.mockRestore()
  })

  it("AI 消息整体复制时剥离块边界换行伪影", () => {
    const message: ChatMessage = {
      id: "ai-copy-1",
      role: "assistant",
      blocks: [{ kind: "text", text: "这个项目架构是怎么样的？" }],
      isStreaming: false,
    }
    const { container } = render(<AgentMessageItem message={message} />)

    const content = container.querySelector(".markdown-preview-content") as HTMLDivElement
    const paragraph = content.firstChild as HTMLParagraphElement
    const textNode = paragraph.firstChild as Text

    const range = document.createRange()
    range.setStart(textNode, 0)
    range.setEndAfter(paragraph)

    const getSelection = vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "这个项目架构是怎么样的？\n\n",
    } as unknown as Selection)

    const { event, dataTransfer } = makeCopyEvent()
    content.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(dataTransfer.getData("text/plain")).toBe("这个项目架构是怎么样的？")
    getSelection.mockRestore()
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

  it("将连续的同名 web_search 调用合并为括号分隔的搜索条件，且不进入普通工具折叠", () => {
    const message: ChatMessage = {
      id: "ws-1",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "ws-1",
          toolName: "web_search",
          args: { query: "react hooks 文档" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "ws-2",
          toolName: "web_search",
          args: { query: "tailwind v4 发布" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getByText("Web Search")).not.toBeNull()
    expect(screen.getByText("[react hooks 文档], [tailwind v4 发布]")).not.toBeNull()
    // web_search 有独立展示块，不参与普通工具折叠组。
    expect(screen.queryByRole("button", { name: /Tool Calls/i })).toBeNull()
  })

  it("web_search 全部调用失败时标注英文失败提示", () => {
    const message: ChatMessage = {
      id: "ws-2",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "ws-1",
          toolName: "web_search",
          args: { query: "foo" },
          status: "error",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getByText("Web Search")).not.toBeNull()
    expect(screen.getByText(/Web search failed/)).not.toBeNull()
  })

  it("思考块与工具调用合并折叠，头部展示英文计数", () => {
    const message: ChatMessage = {
      id: "exec-1",
      role: "assistant",
      blocks: [
        { kind: "thinking", text: "先梳理消息块结构" },
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

    const groupButton = screen.getByRole("button", { name: "展开执行内容" })
    expect(groupButton).not.toBeNull()
    expect(screen.getByText("2 Tool Calls · 1 Thought")).not.toBeNull()

    // 默认折叠，点击后展开并切换按钮文案。
    fireEvent.click(groupButton)
    expect(screen.getByRole("button", { name: "收起执行内容" })).not.toBeNull()
  })

  it("单个工具调用与思考块合并时展示英文单数计数", () => {
    const message: ChatMessage = {
      id: "exec-2",
      role: "assistant",
      blocks: [
        { kind: "thinking", text: "分析中" },
        {
          kind: "toolCall",
          toolCallId: "time-1",
          toolName: "time",
          args: {},
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getByRole("button", { name: "展开执行内容" })).not.toBeNull()
    expect(screen.getByText("1 Tool Call · 1 Thought")).not.toBeNull()
  })

  it("仅单个工具调用且无思考时不折叠", () => {
    const message: ChatMessage = {
      id: "exec-3",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "time-1",
          toolName: "time",
          args: {},
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.queryByRole("button", { name: "展开执行内容" })).toBeNull()
  })

  it("MCP 调用并入执行折叠组，头部展示英文计数", () => {
    const message: ChatMessage = {
      id: "exec-4",
      role: "assistant",
      blocks: [
        {
          kind: "toolCall",
          toolCallId: "mcp-1",
          toolName: "github_get_issue",
          args: { owner: "lx-agent" },
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "mcp-2",
          toolName: "github_list_issues",
          args: { owner: "lx-agent" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    const groupButton = screen.getByRole("button", { name: "展开执行内容" })
    expect(groupButton).not.toBeNull()
    expect(screen.getByText("2 MCP Calls")).not.toBeNull()

    // 默认折叠，点击后展开并切换按钮文案。
    fireEvent.click(groupButton)
    expect(screen.getByRole("button", { name: "收起执行内容" })).not.toBeNull()
  })

  it("工具 + 思考 + MCP 合并折叠，头部展示三类英文计数", () => {
    const message: ChatMessage = {
      id: "exec-5",
      role: "assistant",
      blocks: [
        { kind: "thinking", text: "先规划执行步骤" },
        {
          kind: "toolCall",
          toolCallId: "time-1",
          toolName: "time",
          args: {},
          status: "done",
        },
        {
          kind: "toolCall",
          toolCallId: "mcp-1",
          toolName: "github_get_issue",
          args: { owner: "lx-agent" },
          status: "done",
        },
      ],
      isStreaming: false,
    }

    render(<AgentMessageItem message={message} />)

    expect(screen.getByRole("button", { name: "展开执行内容" })).not.toBeNull()
    expect(screen.getByText("1 Tool Call · 1 Thought · 1 MCP Call")).not.toBeNull()
  })
})
