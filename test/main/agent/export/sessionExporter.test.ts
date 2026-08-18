import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type {
  AgentRestoredSession,
  AgentSessionSummary,
  AssistantMessage,
  CompactionSummaryMessage,
  ToolResultMessage,
  UserMessage,
} from "@shared/contracts/agent"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  copySessionText,
  exportSessionToFile,
  exportToJsonl,
  exportToMarkdown,
  slugify,
} from "@/agent/export/sessionExporter"
import { escapeHtml, generateSessionHtml } from "@/agent/export/htmlTemplate"

vi.mock("electron", () => ({
  dialog: {
    showSaveDialog: vi.fn(),
  },
  shell: {
    openPath: vi.fn().mockResolvedValue(""),
    showItemInFolder: vi.fn(),
  },
}))

describe("Session Export & Share System (v10)", () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "lx-agent-export-test-"))
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  const mockSummary: AgentSessionSummary = {
    id: "session-12345",
    title: "重构用户认证模块",
    cwd: "/Users/dev/project",
    projectId: "proj-1",
    createdAt: "2026-08-18T10:00:00.000Z",
    updatedAt: "2026-08-18T10:30:00.000Z",
  }

  const mockSession: AgentRestoredSession = {
    messages: [
      {
        role: "user",
        content: "请帮我重构 auth.ts 中的 token 校验函数",
        timestamp: 1787047200000,
        isSteer: true,
        command: { name: "review", kind: "prompt", source: "project" },
      } as UserMessage,
      {
        role: "assistant",
        provider: "anthropic",
        model: "claude-3-7-sonnet",
        stopReason: "toolUse",
        usage: { input: 120, output: 45, cacheRead: 0, totalTokens: 165 },
        timestamp: 1787047205000,
        content: [
          { type: "thinking", thinking: "分析 auth.ts 的结构并调用 read 工具" },
          { type: "text", text: "好的，我先读取 `src/auth.ts` 的实现。" },
          {
            type: "toolCall",
            id: "call-1",
            name: "read",
            arguments: { path: "src/auth.ts" },
          },
        ],
      } as AssistantMessage,
      {
        role: "toolResult",
        toolCallId: "call-1",
        toolName: "read",
        isError: false,
        timestamp: 1787047206000,
        content: [{ type: "text", text: "export function verifyToken(t: string) { return true }" }],
      } as ToolResultMessage,
      {
        role: "compactionSummary",
        summary: "早期关于依赖安装的对话已压缩",
        tokensBefore: 4500,
        timestamp: 1787047210000,
        manual: false,
      } as CompactionSummaryMessage,
    ],
    activeCapabilities: { tools: ["read", "write"], mcp: [], skills: [] },
    todos: [
      { content: "读取当前 auth.ts", status: "completed" },
      { content: "重构校验逻辑", status: "in_progress" },
    ],
  }

  describe("HTML Template & Generator", () => {
    it("should escape HTML safely", () => {
      expect(escapeHtml("<script>alert('xss')</script>")).toBe(
        "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;",
      )
    })

    it("should generate self-contained HTML with dark/light themes and message blocks", () => {
      const html = generateSessionHtml(mockSession, mockSummary)

      expect(html).toContain("<!DOCTYPE html>")
      expect(html).toContain("重构用户认证模块")
      expect(html).toContain("session-12345")
      expect(html).toContain("claude-3-7-sonnet")
      expect(html).toContain("即时插话 / Steer")
      expect(html).toContain("review")
      expect(html).toContain("思考过程")
      expect(html).toContain("verifyToken")
      expect(html).toContain("上下文压缩边界")
      expect(html).toContain("任务清单（快照）")
      expect(html).toContain("toggleTheme()")
      expect(html).toContain("function copyCode(button)")
    })
  })

  describe("Markdown Exporter", () => {
    it("should export structured markdown with metadata, turns and details tags", () => {
      const md = exportToMarkdown(mockSession, mockSummary)

      expect(md).toContain("# 重构用户认证模块")
      expect(md).toContain("- **会话 ID**: `session-12345`")
      expect(md).toContain("## 👤 用户 `[Steer]` `[/review]`")
      expect(md).toContain("## 🤖 Agent (claude-3-7-sonnet)")
      expect(md).toContain("<summary>💭 思考过程 (25 字符)</summary>")
      expect(md).toContain("<summary>🔧 工具调用: <code>read</code> (✅ 成功)</summary>")
      expect(md).toContain("> 📦 **[上下文压缩]** 压缩了 ~4500 Tokens")
      expect(md).toContain("- [x] 读取当前 auth.ts")
      expect(md).toContain("- [ ] 重构校验逻辑")
    })
  })

  describe("JSONL Exporter", () => {
    it("should export standard JSONL dataset format with session header", () => {
      const jsonl = exportToJsonl(mockSession, mockSummary)
      const lines = jsonl.trim().split("\n")

      expect(lines.length).toBe(5) // 1 header + 4 messages
      const header = JSON.parse(lines[0])
      expect(header.type).toBe("session_header")
      expect(header.id).toBe("session-12345")
      expect(header.title).toBe("重构用户认证模块")

      const firstMsg = JSON.parse(lines[1])
      expect(firstMsg.role).toBe("user")
      expect(firstMsg.isSteer).toBe(true)
    })
  })

  describe("Clipboard Copy Helper", () => {
    it("should extract last assistant text response", () => {
      const text = copySessionText(mockSession, { target: "last_assistant" })
      expect(text).toBe("好的，我先读取 `src/auth.ts` 的实现。")
    })

    it("should return full markdown when target is markdown", () => {
      const md = copySessionText(mockSession, { target: "markdown" }, mockSummary)
      expect(md).toContain("# 重构用户认证模块")
      expect(md).toContain("## 👤 用户")
    })
  })

  describe("exportSessionToFile", () => {
    it("should export to customPath directly without dialog", async () => {
      const targetPath = join(tempDir, "exported-session.html")
      const result = await exportSessionToFile(mockSession, mockSummary, {
        format: "html",
        customPath: targetPath,
      })

      expect(result.ok).toBe(true)
      if (result.ok && !result.canceled) {
        expect(result.filePath).toBe(targetPath)
        expect(existsSync(targetPath)).toBe(true)
        const fileContent = readFileSync(targetPath, "utf-8")
        expect(fileContent).toContain("重构用户认证模块")
      }
    })

    it("should slugify file names safely", () => {
      expect(slugify("feat: add /export command?")).toBe("feat_-add-_export-command_")
    })
  })
})
