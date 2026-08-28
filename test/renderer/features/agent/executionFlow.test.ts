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
      expect(steps[0].stepIndex).toBe(0)
      expect(steps[0].title).toBe("请帮我查找 main.ts 文件")
      expect(steps[0].userContent?.text).toBe("请帮我查找 main.ts 文件")

      // 2. Thinking
      expect(steps[1].kind).toBe("thinking")
      expect(steps[1].turnIndex).toBe(1)
      expect(steps[1].stepIndex).toBe(1)
      expect(steps[1].thinkingContent?.text).toContain("用户需要查找 main.ts")

      // 3. Tool Call & Paired Result
      expect(steps[2].kind).toBe("tool")
      expect(steps[2].turnIndex).toBe(1)
      expect(steps[2].stepIndex).toBe(2)
      expect(steps[2].title).toBe("find_by_name")
      expect(steps[2].status).toBe("done")
      expect(steps[2].toolContent?.args).toEqual({ Pattern: "main.ts" })
      expect(steps[2].toolContent?.result).toContain("src/main.ts")
      expect(steps[2].toolContent?.isError).toBe(false)

      // 4. Assistant Text
      expect(steps[3].kind).toBe("assistant")
      expect(steps[3].turnIndex).toBe(1)
      expect(steps[3].stepIndex).toBe(3)
      expect(steps[3].title).toBe("已找到 main.ts 文件如下：")
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
      expect(steps[1].title).toBe("code-researcher")
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
      expect(steps.map((s) => s.turnIndex)).toEqual([1, 1, 0, 2, 2])
      expect(steps.map((s) => s.stepIndex)).toEqual([0, 1, 2, 3, 4])

      const compactionStep = steps[2]
      expect(compactionStep.kind).toBe("compaction")
      expect(compactionStep.compactionContent?.isManual).toBe(true)
      expect(compactionStep.compactionContent?.summaryTokens).toBe(800)
    })

    it("正确处理初始模型与后续模型切换为独立步骤（turnIndex 为 0，不计入对话轮次）且统一顺序编号", () => {
      const promptAssembly = {
        sections: [{ name: "identity", text: "You are LX Agent" }],
        contexts: [],
        variables: {},
        rendered: "You are LX Agent",
      }

      const messages: ChatMessage[] = [
        {
          id: "m0",
          role: "modelSwitch",
          model: "gpt-4o",
          provider: "openai",
          family: "gpt",
          instructions: "GPT instructions",
          isInitial: true,
          isStreaming: false,
          blocks: [],
        },
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "你是谁" }],
          isStreaming: false,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [{ kind: "text", text: "我是 LX Agent" }],
          isStreaming: false,
        },
        {
          id: "m1",
          role: "modelSwitch",
          model: "gemini-2.5-pro",
          provider: "google",
          family: "gemini",
          instructions: "Gemini instructions",
          isInitial: false,
          isStreaming: false,
          blocks: [],
        },
        {
          id: "u2",
          role: "user",
          blocks: [{ kind: "text", text: "写个测试" }],
          isStreaming: false,
        },
      ]

      const steps = buildExecutionSteps(messages, promptAssembly)
      expect(steps).toHaveLength(6)

      // #0 System
      expect(steps[0].id).toBe("step-0-system-prompt")
      expect(steps[0].kind).toBe("system")
      expect(steps[0].stepIndex).toBe(0)
      expect(steps[0].turnIndex).toBe(0)

      // #1 Initial Model (独立 item，不与 system 合并，不计入轮次 turnIndex: 0)
      expect(steps[1].kind).toBe("modelSwitch")
      expect(steps[1].stepIndex).toBe(1)
      expect(steps[1].turnIndex).toBe(0)
      expect(steps[1].modelSwitchContent?.isInitial).toBe(true)

      // #2 User Turn 1
      expect(steps[2].kind).toBe("user")
      expect(steps[2].stepIndex).toBe(2)
      expect(steps[2].turnIndex).toBe(1)

      // #3 Assistant Turn 1
      expect(steps[3].kind).toBe("assistant")
      expect(steps[3].stepIndex).toBe(3)
      expect(steps[3].turnIndex).toBe(1)

      // #4 Switched Model (独立 item/QA，不与 Turn 1 合并，不计入轮次 turnIndex: 0)
      expect(steps[4].kind).toBe("modelSwitch")
      expect(steps[4].stepIndex).toBe(4)
      expect(steps[4].turnIndex).toBe(0)
      expect(steps[4].modelSwitchContent?.isInitial).toBe(false)

      // #5 User Turn 2
      expect(steps[5].kind).toBe("user")
      expect(steps[5].stepIndex).toBe(5)
      expect(steps[5].turnIndex).toBe(2)
    })

    it("正确计算步骤间跨度与 Agent 响应开销（间隔时间归属于后置 step）", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "读取文件" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [
            {
              kind: "toolCall",
              toolCallId: "c1",
              toolName: "read_file",
              args: { path: "a.txt" },
              status: "done",
            },
          ],
          isStreaming: false,
          timestamp: 2500,
        },
        {
          id: "t1",
          role: "toolResult",
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "c1",
              toolName: "read_file",
              text: "content",
              isError: false,
              durationMs: 50,
            },
          ],
          isStreaming: false,
          timestamp: 2550,
        },
        {
          id: "a2",
          role: "assistant",
          blocks: [{ kind: "text", text: "文件已读完", durationMs: 200 }],
          isStreaming: false,
          timestamp: 4000,
        },
      ]

      const steps = buildExecutionSteps(messages)
      expect(steps).toHaveLength(3)

      // 1. User Step: 从 1000 到 Tool 启动 2500，耗时 1500ms（AI 首字响应耗时）
      expect(steps[0].kind).toBe("user")
      expect(steps[0].durationMs).toBe(1500)
      expect(steps[0].stepSpanMs).toBe(1500)
      expect(steps[0].status).toBe("done")
      expect(steps[0].agentOverheadMs).toBeUndefined()

      // 2. Tool Step: 自身执行 50ms (2500 ~ 2550)，前置已被 User 耗时对齐，自身 overhead = 0
      expect(steps[1].kind).toBe("tool")
      expect(steps[1].durationMs).toBe(50)
      expect(steps[1].startedAt).toBe(2500)
      expect(steps[1].completedAt).toBe(2550)
      expect(steps[1].stepSpanMs).toBe(50)
      expect(steps[1].agentOverheadMs).toBe(0)

      // 3. Assistant Step: 自身执行 200ms，从 Tool 完成 (2550) 到 Assistant 完成 (4200) 跨度 1650ms
      // overhead = 1650 - 200 = 1450ms（工具完成后模型回复生成前的响应开销）
      expect(steps[2].kind).toBe("assistant")
      expect(steps[2].durationMs).toBe(200)
      expect(steps[2].stepSpanMs).toBe(1650)
      expect(steps[2].agentOverheadMs).toBe(1450)
    })

    it("Assistant 文本与 Tool 之间的生成间隔归属于 Tool 步骤，Assistant 文本不虚高耗时且完成后非 running", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "渲染 App" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          isStreaming: true,
          timestamp: 1500,
          blocks: [
            // 已完成输出的文本块（durationMs 已结算为 1500ms）
            {
              kind: "text",
              text: "好的，我来渲染一个数据仪表盘 App 原型：",
              durationMs: 1500,
            },
            // 正在调用中的 tool 块
            {
              kind: "toolCall",
              toolCallId: "c-render",
              toolName: "render_html",
              args: { html: "<div>App</div>" },
              status: "running",
            },
          ],
        },
      ]

      const steps = buildExecutionSteps(messages)
      expect(steps).toHaveLength(3)

      // 1. User
      expect(steps[0].kind).toBe("user")

      // 2. Assistant 文本：已完成输出，状态必须为 done（不卡在 loading），耗时仅为其实际输出的 1500ms
      expect(steps[1].kind).toBe("assistant")
      expect(steps[1].status).toBe("done")
      expect(steps[1].durationMs).toBe(1500)
      expect(steps[1].title).toBe("好的，我来渲染一个数据仪表盘 App 原型：")

      // 3. Tool: 正在运行中
      expect(steps[2].kind).toBe("tool")
      expect(steps[2].status).toBe("running")
    })

    it("同一 message 中 thinking 与 toolCall 共存且包含空 text 时，空 text 被过滤，tool 承载生成开销且 thinking 耗时不被污染", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "渲染原型" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          isStreaming: false,
          timestamp: 2000, // 消息请求于 2000ms 发起
          blocks: [
            {
              kind: "thinking",
              text: "The user wants a mobile app prototype...",
              durationMs: 723, // 思考耗时 723ms (2000 ~ 2723)
            },
            {
              kind: "text",
              text: "", // 临时产生的空 text 块（应被自动忽略）
            },
            {
              kind: "toolCall",
              toolCallId: "c-html",
              toolName: "render_html",
              args: { html: "<div>HTML App</div>" },
              status: "done",
            },
          ],
        },
        {
          id: "t1",
          role: "toolResult",
          isStreaming: false,
          timestamp: 77723, // 75 秒后 tool 执行完毕 (2723 ~ 77723 为生成 HTML 参数耗时)
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "c-html",
              toolName: "render_html",
              text: "rendered",
              isError: false,
              durationMs: 0,
            },
          ],
        },
      ]

      const steps = buildExecutionSteps(messages)
      // 步骤应当只有：User, Thinking, Tool（无空 Assistant 幽灵步骤）
      expect(steps).toHaveLength(3)

      // 1. User: 从 1000 到 Thinking 启动 2000，耗时 1000ms（AI 首字响应耗时）
      expect(steps[0].kind).toBe("user")
      expect(steps[0].durationMs).toBe(1000)
      expect(steps[0].stepSpanMs).toBe(1000)
      expect(steps[0].status).toBe("done")

      // 2. Thinking: 从 2000 到 2723，耗时 723ms，自身 overhead = 0
      expect(steps[1].kind).toBe("thinking")
      expect(steps[1].durationMs).toBe(723)
      expect(steps[1].startedAt).toBe(2000)
      expect(steps[1].completedAt).toBe(2723)
      expect(steps[1].agentOverheadMs).toBe(0)
      expect(steps[1].stepSpanMs).toBe(723)

      // 3. Tool: 从 Thinking 结束 (2723) 到 Tool 完成 (77723)，span = 75000ms
      // overhead 应当归属于 Tool 自身（75000ms 生成与调用开销），而不是算到 Thinking 头上！
      expect(steps[2].kind).toBe("tool")
      expect(steps[2].durationMs).toBe(0)
      expect(steps[2].startedAt).toBe(77723)
      expect(steps[2].completedAt).toBe(77723)
      expect(steps[2].stepSpanMs).toBe(75000)
      expect(steps[2].agentOverheadMs).toBe(75000)
    })

    it("工具还在执行时（未收到 toolResult）状态保持为 running，收到 toolResult 后转为 done", () => {
      // 1. 工具调用已发出，但 toolResult 尚未到达
      const runningMessages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "渲染 svg" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          isStreaming: false,
          timestamp: 1500,
          blocks: [
            {
              kind: "toolCall",
              toolCallId: "c-svg",
              toolName: "render_svg",
              args: { svg: "<svg></svg>" },
              status: "running",
            },
          ],
        },
      ]

      const runningSteps = buildExecutionSteps(runningMessages)
      expect(runningSteps).toHaveLength(2)
      expect(runningSteps[1].kind).toBe("tool")
      expect(runningSteps[1].status).toBe("running")

      // 2. 收到 toolResult 后
      const completedMessages: ChatMessage[] = [
        ...runningMessages,
        {
          id: "t1",
          role: "toolResult",
          isStreaming: false,
          timestamp: 2000,
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "c-svg",
              toolName: "render_svg",
              text: "rendered svg successfully",
              isError: false,
              durationMs: 120,
            },
          ],
        },
      ]

      const completedSteps = buildExecutionSteps(completedMessages)
      expect(completedSteps).toHaveLength(2)
      expect(completedSteps[1].kind).toBe("tool")
      expect(completedSteps[1].status).toBe("done")
      expect(completedSteps[1].durationMs).toBe(120)
    })

    it("User 步骤在 AI 尚未响应时保持 running 状态，AI 响应后转为 done 并计算 AI 响应时长", () => {
      // 1. 刚发送 User prompt，AI 尚未产生任何步骤（网络等待中）
      const waitingMessages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "这个项目的agent是怎么样实现的？" }],
          isStreaming: false,
          timestamp: 1000,
        },
      ]

      const waitingSteps = buildExecutionSteps(waitingMessages)
      expect(waitingSteps).toHaveLength(1)
      expect(waitingSteps[0].kind).toBe("user")
      expect(waitingSteps[0].status).toBe("running")
      expect(waitingSteps[0].durationMs).toBeUndefined()

      // 2. AI 产生第一个响应（例如 1.5s 后开始 thinking）
      const respondedMessages: ChatMessage[] = [
        ...waitingMessages,
        {
          id: "a1",
          role: "assistant",
          isStreaming: true,
          timestamp: 2500, // 1500ms 后首字到达
          blocks: [
            {
              kind: "thinking",
              text: "正在分析项目架构...",
            },
          ],
        },
      ]

      const respondedSteps = buildExecutionSteps(respondedMessages)
      expect(respondedSteps).toHaveLength(2)
      expect(respondedSteps[0].kind).toBe("user")
      expect(respondedSteps[0].status).toBe("done")
      expect(respondedSteps[0].durationMs).toBe(1500)
      expect(respondedSteps[0].stepSpanMs).toBe(1500)

      expect(respondedSteps[1].kind).toBe("thinking")
      expect(respondedSteps[1].status).toBe("running")
    })

    it("当 assistant 消息仅包含 toolCall 时，正确将 message.usage 赋值给 tool 步骤", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "读取配置" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          blocks: [
            {
              kind: "toolCall",
              toolCallId: "call-1",
              toolName: "read_file",
              args: { path: "config.json" },
              status: "done",
            },
          ],
          isStreaming: false,
          timestamp: 1010,
          usage: {
            input: 1200,
            output: 45,
            cacheRead: 300,
            totalTokens: 1245,
          },
        },
        {
          id: "t1",
          role: "toolResult",
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "call-1",
              toolName: "read_file",
              text: "{}",
              isError: false,
            },
          ],
          isStreaming: false,
          timestamp: 1020,
        },
      ]

      const steps = buildExecutionSteps(messages)
      expect(steps).toHaveLength(2)
      expect(steps[1].kind).toBe("tool")
      expect(steps[1].tokens).toEqual({
        input: 1200,
        output: 45,
        cacheRead: 300,
        total: 1245,
      })
    })
  })
})
