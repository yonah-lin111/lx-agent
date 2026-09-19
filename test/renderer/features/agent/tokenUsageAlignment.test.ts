// @vitest-environment jsdom
import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useFlowStats } from "@/features/agent/components/AgentExecutionFlowList/hooks/useFlowStats"
import { calculateQaUsage } from "@/features/agent/components/AgentMessageList/AgentMessageItem/utils"
import { buildExecutionSteps } from "@/features/agent/executionFlow"
import type { ChatMessage } from "@/features/agent/types"

describe("Token 用量对齐测试 (AgentExecutionFlowList vs AgentMessageList)", () => {
  describe("calculateQaUsage", () => {
    it("无 usage 且无 subagent 时返回 null", () => {
      const msg: ChatMessage = {
        id: "a1",
        role: "assistant",
        blocks: [{ kind: "text", text: "hello" }],
        isStreaming: false,
      }
      expect(calculateQaUsage(msg)).toBeNull()
    })

    it("正确累加单个助手消息直接用量", () => {
      const msg: ChatMessage = {
        id: "a1",
        role: "assistant",
        usage: { input: 100, output: 50, cacheRead: 20, cacheWrite: 0, totalTokens: 150 },
        blocks: [{ kind: "text", text: "hello" }],
        isStreaming: false,
      }
      const result = calculateQaUsage(msg)
      expect(result).toEqual({
        input: 100,
        output: 50,
        cacheRead: 20,
        totalTokens: 150,
      })
    })

    it("正确累加 subagent 用量，并在 toolCall 与 toolResult 间去重", () => {
      const subagentData = {
        name: "test-subagent",
        description: "subagent task",
        prompt: "do work",
        messages: [],
        steps: [],
        usage: {
          input: 500,
          output: 200,
          cacheRead: 50,
          cacheWrite: 0,
          totalTokens: 700,
        },
      }

      const assistantMsg: ChatMessage = {
        id: "a1",
        role: "assistant",
        usage: { input: 100, output: 30, cacheRead: 10, cacheWrite: 0, totalTokens: 130 },
        blocks: [
          {
            kind: "toolCall",
            toolCallId: "call-sub-1",
            toolName: "task",
            args: {},
            status: "done",
            subagent: subagentData,
          },
        ],
        isStreaming: false,
      }

      const toolResultMsg: ChatMessage = {
        id: "t1",
        role: "toolResult",
        blocks: [
          {
            kind: "toolResult",
            toolCallId: "call-sub-1",
            toolName: "task",
            text: "done",
            isError: false,
            subagent: subagentData,
          },
        ],
        isStreaming: false,
      }

      const finalAssistantMsg: ChatMessage = {
        id: "a2",
        role: "assistant",
        usage: { input: 150, output: 80, cacheRead: 20, cacheWrite: 0, totalTokens: 230 },
        blocks: [{ kind: "text", text: "task completed" }],
        isStreaming: false,
      }

      const result = calculateQaUsage(assistantMsg, [toolResultMsg, finalAssistantMsg])

      // 主 Agent 调用 1: 100 in, 30 out, 10 cache, 130 total
      // Subagent: 500 in, 200 out, 50 cache, 700 total (去重，只加一次)
      // 主 Agent 调用 2: 150 in, 80 out, 20 cache, 230 total
      // 合计: 100 + 500 + 150 = 750 in; 30 + 200 + 80 = 310 out; 10 + 50 + 20 = 80 cache; 130 + 700 + 230 = 1060 total
      expect(result).toEqual({
        input: 750,
        output: 310,
        cacheRead: 80,
        totalTokens: 1060,
      })
    })
  })

  describe("AgentExecutionFlowList 与 AgentMessageList 跨组件统计一致性", () => {
    it("一次带 Subagent 的轮次中，FlowList 的 turnStats 与 MessageList 的 calculateQaUsage 完全一致", () => {
      const subagentData = {
        name: "code-researcher",
        description: "search files",
        prompt: "find code",
        messages: [],
        steps: [],
        usage: {
          input: 800,
          output: 250,
          cacheRead: 100,
          cacheWrite: 0,
          totalTokens: 1050,
        },
      }

      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "帮我调研代码库" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "a1",
          role: "assistant",
          usage: { input: 2000, output: 80, cacheRead: 500, cacheWrite: 0, totalTokens: 2080 },
          blocks: [
            { kind: "thinking", text: "需要使用子代理调研" },
            {
              kind: "toolCall",
              toolCallId: "call-task-1",
              toolName: "task",
              args: { prompt: "find code" },
              status: "done",
              subagent: subagentData,
            },
          ],
          isStreaming: false,
          timestamp: 1010,
        },
        {
          id: "t1",
          role: "toolResult",
          blocks: [
            {
              kind: "toolResult",
              toolCallId: "call-task-1",
              toolName: "task",
              text: "finished research",
              isError: false,
              subagent: subagentData,
            },
          ],
          isStreaming: false,
          timestamp: 1020,
        },
        {
          id: "a2",
          role: "assistant",
          usage: { input: 3000, output: 120, cacheRead: 800, cacheWrite: 0, totalTokens: 3120 },
          blocks: [{ kind: "text", text: "根据调研结果如下..." }],
          isStreaming: false,
          timestamp: 1030,
        },
      ]

      // 1. MessageList 端计算 QA Token
      const qaUsage = calculateQaUsage(messages[1], [messages[2], messages[3]])
      expect(qaUsage).not.toBeNull()
      // 主 Agent a1: 2000 in, 80 out
      // Subagent: 800 in, 250 out
      // 主 Agent a2: 3000 in, 120 out
      // 合计: 2000 + 800 + 3000 = 5800 in; 80 + 250 + 120 = 450 out; 500 + 100 + 800 = 1400 cache; 2080 + 1050 + 3120 = 6250 total
      expect(qaUsage).toEqual({
        input: 5800,
        output: 450,
        cacheRead: 1400,
        totalTokens: 6250,
      })

      // 2. FlowList 端步骤构建与指标汇总
      const steps = buildExecutionSteps(messages)
      const subagentStep = steps.find((s) => s.kind === "subagent")
      expect(subagentStep).toBeDefined()
      // 检查 Subagent step 自身保留子代理用量，且 parentTokens 捕获主模型调度用量
      expect(subagentStep?.tokens).toEqual({
        input: 800,
        output: 250,
        cacheRead: 100,
        total: 1050,
      })
      expect(subagentStep?.parentTokens).toEqual({
        input: 2000,
        output: 80,
        cacheRead: 500,
        total: 2080,
      })

      // 计算 turnStats
      const { result: flowStatsResult } = renderHook(() =>
        useFlowStats({ steps, isStreaming: false, maxTurn: 1 }),
      )
      const turn1 = flowStatsResult.current.turnStatsMap.get(1)
      expect(turn1).toBeDefined()

      // 两端统计数字必须 100% 严格一致
      expect(turn1?.inputTokens).toBe(qaUsage?.input)
      expect(turn1?.outputTokens).toBe(qaUsage?.output)
      expect(turn1?.cacheReadTokens).toBe(qaUsage?.cacheRead)
      expect(turn1?.totalTokens).toBe(qaUsage?.totalTokens)
    })

    it("压缩步骤（compactionSummary）的 Token 不污染用户交互轮次的 QA turnStats", () => {
      const messages: ChatMessage[] = [
        {
          id: "u1",
          role: "user",
          blocks: [{ kind: "text", text: "压缩测试" }],
          isStreaming: false,
          timestamp: 1000,
        },
        {
          id: "compaction-1",
          role: "compactionSummary",
          compactionUsage: { input: 50000, output: 500 },
          blocks: [{ kind: "text", text: "已压缩上下文" }],
          isStreaming: false,
          timestamp: 1005,
        },
        {
          id: "a1",
          role: "assistant",
          usage: { input: 1000, output: 50, cacheRead: 100, cacheWrite: 0, totalTokens: 1050 },
          blocks: [{ kind: "text", text: "正常回复" }],
          isStreaming: false,
          timestamp: 1010,
        },
      ]

      const steps = buildExecutionSteps(messages)
      const { result: flowStatsResult } = renderHook(() =>
        useFlowStats({ steps, isStreaming: false, maxTurn: 1 }),
      )
      const turn1 = flowStatsResult.current.turnStatsMap.get(1)

      // turnStats 中不包含 compaction 的 50000 input
      expect(turn1?.inputTokens).toBe(1000)
      expect(turn1?.outputTokens).toBe(50)

      // 但全局 stats 仍然记录了全局消耗
      expect(flowStatsResult.current.stats.inputTokens).toBe(51000)
      expect(flowStatsResult.current.stats.outputTokens).toBe(550)
    })
  })
})
