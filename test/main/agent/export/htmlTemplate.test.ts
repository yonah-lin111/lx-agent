import type {
  AgentRestoredSession,
  AgentSessionSummary,
  AssistantMessage,
  ToolResultMessage,
  UserMessage,
} from "@shared/contracts/agent"
import { describe, expect, it } from "vitest"
import { generateSessionHtml, simpleMarkdownToHtml } from "@/agent/export/htmlTemplate"

const summary: AgentSessionSummary = {
  id: "session-html-1",
  title: "HTML 模板行为",
  cwd: "/tmp/project",
  projectId: "proj-1",
  createdAt: "2026-08-18T10:00:00.000Z",
  updatedAt: "2026-08-18T10:30:00.000Z",
}

const sessionOf = (messages: AgentRestoredSession["messages"]): AgentRestoredSession =>
  ({
    messages,
    activeCapabilities: { tools: [], mcp: [], skills: [] },
  }) as unknown as AgentRestoredSession

describe("simpleMarkdownToHtml 块级与行内规则", () => {
  it("空输入返回空串", () => {
    expect(simpleMarkdownToHtml("")).toBe("")
  })

  it("标题按 # 数量生成 h1/h2/h3", () => {
    const html = simpleMarkdownToHtml("# 一级\n## 二级\n### 三级")

    expect(html).toContain("<h1>一级</h1>")
    expect(html).toContain("<h2>二级</h2>")
    expect(html).toContain("<h3>三级</h3>")
    expect(html).not.toContain("<p>")
  })

  it("加粗与斜体包裹为 strong/em", () => {
    const html = simpleMarkdownToHtml("**加粗** 与 *斜体*")

    expect(html).toContain("<strong>加粗</strong>")
    expect(html).toContain("<em>斜体</em>")
  })

  it("无序列表转换为 li；引用行因先转义 > 保持转义文本", () => {
    const html = simpleMarkdownToHtml("> 引用内容\n\n- 列表项")

    expect(html).toContain("<li>列表项</li>")
    // 既有行为：> 在前置转义中变为 &gt;，引用块规则不生效。
    expect(html).toContain("&gt; 引用内容")
    expect(html).not.toContain("<blockquote>")
  })

  it("段落内的单换行转为 br", () => {
    const html = simpleMarkdownToHtml("第一行\n第二行")

    expect(html).toBe("<p>第一行<br/>第二行</p>")
  })
})

describe("generateSessionHtml 消息片段渲染", () => {
  it("用户附件渲染为 file-tag 并转义文件名", () => {
    const html = generateSessionHtml(
      sessionOf([
        {
          role: "user",
          content: "看下这个文件",
          timestamp: 1787047200000,
          files: [{ name: "<img src=x>.ts" }],
        } as unknown as UserMessage,
      ]),
      summary,
    )

    expect(html).toContain('class="files-attachment"')
    expect(html).toContain("&lt;img src=x&gt;.ts")
    expect(html).not.toContain("<img src=x>.ts")
  })

  it("助手消息渲染模型徽章与 Token 统计", () => {
    const html = generateSessionHtml(
      sessionOf([
        {
          role: "assistant",
          provider: "anthropic",
          model: "claude-3-7-sonnet",
          stopReason: "stop",
          usage: { input: 120, output: 45, cacheRead: 0, cacheWrite: 0, totalTokens: 165 },
          timestamp: 1787047205000,
          content: [{ type: "text", text: "完成" }],
        } as AssistantMessage,
      ]),
      summary,
    )

    expect(html).toContain('class="badge badge-model"')
    expect(html).toContain('class="token-info"')
    expect(html).toContain("In: 120 / Out: 45")
  })

  it("工具调用渲染 Diff 行与输出区", () => {
    const html = generateSessionHtml(
      sessionOf([
        {
          role: "assistant",
          provider: "anthropic",
          model: "claude-3-7-sonnet",
          stopReason: "toolUse",
          usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
          timestamp: 1787047205000,
          content: [
            { type: "toolCall", id: "call-9", name: "edit", arguments: { file: "auth.ts" } },
          ],
        } as AssistantMessage,
        {
          role: "toolResult",
          toolCallId: "call-9",
          toolName: "edit",
          isError: false,
          timestamp: 1787047206000,
          content: [{ type: "text", text: "已写入" }],
          diff: {
            lines: [
              { type: "del", text: "old <code>" },
              { type: "add", text: "new code" },
              { type: "ctx", text: "unchanged" },
            ],
          },
        } as unknown as ToolResultMessage,
      ]),
      summary,
    )

    expect(html).toContain("文件修改 Diff")
    expect(html).toContain('class="diff-line diff-line-add"')
    expect(html).toContain('class="diff-line diff-line-del"')
    expect(html).toContain('class="diff-line diff-line-ctx"')
    expect(html).toContain("old &lt;code&gt;")
    expect(html).toContain("已写入")
  })

  it("工具调用失败渲染错误状态", () => {
    const html = generateSessionHtml(
      sessionOf([
        {
          role: "assistant",
          provider: "anthropic",
          model: "claude-3-7-sonnet",
          stopReason: "toolUse",
          usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 15 },
          timestamp: 1787047205000,
          content: [{ type: "toolCall", id: "call-err", name: "bash", arguments: { cmd: "ls" } }],
        } as AssistantMessage,
        {
          role: "toolResult",
          toolCallId: "call-err",
          toolName: "bash",
          isError: true,
          timestamp: 1787047206000,
          content: [{ type: "text", text: "command failed" }],
        } as ToolResultMessage,
      ]),
      summary,
    )

    expect(html).toContain('class="tool-badge tool-status-error"')
    expect(html).toContain("执行失败")
    expect(html).not.toContain('class="tool-badge tool-status-success"')
  })

  it("待办清单区分完成与进行中样式", () => {
    const session = {
      ...sessionOf([]),
      todos: [
        { content: "已完成项", status: "completed" },
        { content: "进行中项", status: "in_progress" },
      ],
    } as unknown as AgentRestoredSession
    const html = generateSessionHtml(session, summary)

    expect(html).toContain("任务清单（快照）")
    expect(html).toContain("1/2 已完成")
    expect(html).toContain('class="todo-completed"')
    expect(html).toContain('class="todo-check pending"')
  })

  it("输出包含内联样式与交互脚本", () => {
    const html = generateSessionHtml(sessionOf([]), summary)

    expect(html).toContain('data-theme="dark"')
    expect(html).toContain(".code-block-wrapper")
    expect(html).toContain("function copyCode(button)")
    expect(html).toContain("function copySnippet(button)")
    expect(html).toContain("function toggleAllTools()")
  })
})
