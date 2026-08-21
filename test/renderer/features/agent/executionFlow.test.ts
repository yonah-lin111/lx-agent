import { describe, expect, it } from "vitest"
import { buildExecutionSteps, formatPreview } from "@/features/agent/executionFlow"
import type { ChatMessage } from "@/features/agent/types"

describe("executionFlow", () => {
  describe("formatPreview", () => {
    it("压缩空白并截断长文本", () => {
      expect(formatPreview("  hello   world  ")).toBe("hello world")
      expect(formatPreview("a".repeat(100), 10)).toBe(`${"a".repeat(10)}...`)
      expect(formatPreview("")).toBe("")
    })
  })

  describe("buildExecutionSteps", () => {
    it("空消息列表返回空步骤", () => {
      expect(buildExecutionSteps([])).toEqual([])
    })

    it("正确解析单轮完整执行链：用户输入 -> 思考 -> 工具调用与结果 -> 助手回复", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "请帮我查找 main.ts 文件" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [
            { kind: "thinking", text: "用户需要查找 main.ts，我应该使用 find 工具。" },
            {
              kind: "toolCall",
              toolCallId: "call-1",
              toolName: "find_by_name",
              args: { Pattern: "main.ts" },
              status: "done",
            },
            { kind: "text", text: "已找到 main.ts 文件如下：" },
          ],
          isStreaming: false,
          timestamp: 1010,
          usage: {
            input: 100,
            output: 50,
            cacheRead: 0,
            totalTokens: 150,
          },
        },
        {
          id: "t1",
          role: "toolResult",
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "call-1",
              toolName: "find_by_name",
              text: "src/main.ts\npackages/cli/main.ts",
              isError: false,
            },
          ],
          isStreaming: false,
          timestamp: 1020,
        },
      ]

      const steps = buildExecutionSteps(messages)
      expect(steps).toHaveLength(4)

      // 1. User
      expect(steps[0].kind).toBe("user")
      expect(steps[0].turnIndex).toBe(1)
      expect(steps[0].stepIndex).toBe(1)
      expect(steps[0].title).toBe("请帮我查找 main.ts 文件")
      expect(steps[0].userContent?.text).toBe("请帮我查找 main.ts 文件")

      // 2. Thinking
      expect(steps[1].kind).toBe("thinking")
      expect(steps[1].turnIndex).toBe(1)
      expect(steps[1].stepIndex).toBe(2)
      expect(steps[1].thinkingContent?.text).toContain("用户需要查找 main.ts")

      // 3. Tool Call & Paired Result
      expect(steps[2].kind).toBe("tool")
      expect(steps[2].turnIndex).toBe(1)
      expect(steps[2].stepIndex).toBe(3)
      expect(steps[2].title).toBe("Tool: find_by_name")
      expect(steps[2].status).toBe("done")
      expect(steps[2].toolContent?.args).toEqual({ Pattern: "main.ts" })
      expect(steps[2].toolContent?.result).toContain("src/main.ts")
      expect(steps[2].toolContent?.isError).toBe(false)

      // 4. Assistant Text
      expect(steps[3].kind).toBe("assistant")
      expect(steps[3].turnIndex).toBe(1)
      expect(steps[3].stepIndex).toBe(4)
      expect(steps[3].title).toBe("Assistant Response")
      expect(steps[3].subtitle).toBe("已找到 main.ts 文件如下：")
      expect(steps[3].tokens?.total).toBe(150)
    })

    it("支持系统提示词装配并注入 Step #0", () => {
      const promptAssembly = {
        sections: [
          { name: "harness:identity", text: "You are LX Agent" },
          { name: "agent:instructions", text: "Follow project guidelines" },
        ],
        contexts: [{ name: "agent:runtime-context", text: "OS: mac, CWD: /foo/proj" }],
        variables: { cwd: "/foo/proj" },
        activeTools: ["read", "write", "bash"],
        rendered: "You are LX Agent\n\nFollow project guidelines",
      }

      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "Hello" }],
          isStreaming: false,
        },
      ]

      const steps = buildExecutionSteps(messages, promptAssembly)
      expect(steps).toHaveLength(2)
      expect(steps[0].id).toBe("step-0-system-prompt")
      expect(steps[0].kind).toBe("system")
      expect(steps[0].turnIndex).toBe(0)
      expect(steps[0].stepIndex).toBe(0)
      expect(steps[0].systemContent?.sections).toHaveLength(2)
      expect(steps[0].systemContent?.activeTools).toEqual(["read", "write", "bash"])
      expect(steps[1].kind).toBe("user")
    })

    it("正确识别子代理任务与失败状态", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "执行复杂调研" }],
          isStreaming: false,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [
            {
              kind: "toolCall",
              toolCallId: "call-task-1",
              toolName: "task",
              args: { prompt: "research architecture" },
              status: "error",
              subagent: {
                name: "code-researcher",
                description: "researching",
                prompt: "research architecture",
                messages: [],
                steps: [],
                usage: { input: 200, output: 80, cacheRead: 0, totalTokens: 280 },
              },
            },
          ],
          isStreaming: false,
        },
        {
          id: "t1",
          role: "toolResult",
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "call-task-1",
              toolName: "task",
              text: "Task execution timeout",
              isError: true,
            },
          ],
          isStreaming: false,
        },
      ]

      const steps = buildExecutionSteps(messages)
      expect(steps).toHaveLength(2)
      expect(steps[1].kind).toBe("subagent")
      expect(steps[1].title).toBe("Subagent: code-researcher")
      expect(steps[1].status).toBe("error")
      expect(steps[1].subagentContent?.name).toBe("code-researcher")
      expect(steps[1].tokens?.total).toBe(280)
      expect(steps[1].toolContent?.isError).toBe(true)
      expect(steps[1].toolContent?.result).toBe("Task execution timeout")
    })

    it("正确处理多轮对话与上下文压缩", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "Turn 1 question" }],
          isStreaming: false,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [{ kind: "text", text: "Turn 1 answer" }],
          isStreaming: false,
        },
        {
          id: "c1",
          role: "compactionSummary",
          blocks: [{ kind: "text", text: "Summary" }],
          isStreaming: false,
          isManual: true,
          summaryTokens: 800,
          compactionUsage: { input: 4000, output: 300 },
        },
        {
          id: "u2",
          role: "user",
          blocks: [{ kind: "text", text: "Turn 2 question" }],
          isStreaming: false,
        },
        {
          id: "a2",
          role: "assistant",
          blocks: [{ kind: "text", text: "Turn 2 answer" }],
          isStreaming: false,
        },
      ]

      const steps = buildExecutionSteps(messages)
      expect(steps).toHaveLength(5)
      expect(steps.map((s) => s.turnIndex)).toEqual([1, 1, 1, 2, 2])
      expect(steps.map((s) => s.stepIndex)).toEqual([1, 2, 3, 4, 5])

      const compactionStep = steps[2]
      expect(compactionStep.kind).toBe("compaction")
      expect(compactionStep.compactionContent?.isManual).toBe(true)
      expect(compactionStep.compactionContent?.summaryTokens).toBe(800)
    })
  })
})
