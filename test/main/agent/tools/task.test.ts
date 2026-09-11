import type { AssistantMessage, SubagentData, Usage } from "@shared/contracts/agent"
import type { SubagentSettings } from "@shared/settings"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { AgentTool } from "@/agent/core/types"
import { REVIEW_AGENT_SYSTEM_PROMPT } from "@/agent/subagent/reviewAgent"
import { SubagentPool } from "@/agent/subagent/subagentPool"
import { SubagentRuntime } from "@/agent/subagent/subagentRuntime"
import { createTaskTool, type TaskToolDeps } from "@/agent/tools/task"

const EMPTY_USAGE: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 }

const TEST_TOOL_SCHEMA = z.object({ path: z.string().optional() })

// 脚本化的 mock streamFn：逐次返回预设助手响应，避免真实 LLM 调用。
const holder = vi.hoisted(() => ({
  streamResponses: [] as AssistantMessage[],
}))

vi.mock("@/agent/stream/aiSdkStreamFn", async () => {
  const { createAssistantMessageEventStream } = await import("@/agent/core/event-stream")
  return {
    createAiSdkStreamFn: () => async () => {
      const response = holder.streamResponses.shift()
      if (!response) throw new Error("No more mock responses")
      const stream = createAssistantMessageEventStream()
      stream.push({ type: "start", partial: response })
      stream.push({ type: "done", reason: response.stopReason, message: response })
      stream.end()
      return stream
    },
  }
})

// 构造助手消息。
const assistant = (blocks: AssistantMessage["content"]): AssistantMessage => ({
  role: "assistant",
  content: blocks,
  provider: "p",
  model: "m",
  usage: EMPTY_USAGE,
  stopReason: "stop",
  timestamp: 0,
})

// 构造工具调用块。
const toolCallBlock = (id: string, name: string, args: Record<string, unknown>) => ({
  type: "toolCall" as const,
  id,
  name,
  arguments: args,
})

// 构造子代理内部工具。
const makeTool = (name: string): AgentTool<typeof TEST_TOOL_SCHEMA> => ({
  name,
  label: name,
  description: `${name} tool`,
  inputSchema: TEST_TOOL_SCHEMA,
  execute: async () => ({ content: [{ type: "text", text: `${name} ok` }] }),
})

// 构造带角色配置的 task 工具（默认设置 = 兼容旧行为）。
const createTestTool = (options: {
  pool?: SubagentPool
  runtime?: SubagentRuntime
  settings?: SubagentSettings
  tools?: AgentTool<any>[]
  resolveModelSelection?: NonNullable<TaskToolDeps["resolveModelSelection"]>
}): ReturnType<typeof createTaskTool> => {
  return createTaskTool({
    systemPrompt: "父系统提示词",
    model: { provider: "p", id: "m" },
    beforeToolCall: async () => undefined,
    getSignal: () => undefined,
    recordChildCall: vi.fn(),
    getTools: () => options.tools ?? [],
    ...(options.pool ? { subagentPool: options.pool } : {}),
    ...(options.runtime ? { subagentRuntime: options.runtime } : {}),
    ...(options.settings ? { subagentSettings: options.settings } : {}),
    ...(options.resolveModelSelection
      ? { resolveModelSelection: options.resolveModelSelection }
      : {}),
  })
}

// 提取 ToolResult 中的文本。
const resultText = (result: { content: Array<{ type: string; text?: string }> }): string =>
  result.content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("")

beforeEach(() => {
  holder.streamResponses.length = 0
})

describe("task 子代理工具", () => {
  it("捕获内部工具步骤与完整快照，经 onUpdate 与结果回传", async () => {
    const executedCalls: { toolCallId: string; params: unknown }[] = []
    const mockTool: AgentTool<typeof TEST_TOOL_SCHEMA> = {
      name: "test_tool",
      label: "测试工具",
      description: "子代理内部工具",
      inputSchema: TEST_TOOL_SCHEMA,
      execute: async (toolCallId, params) => {
        executedCalls.push({ toolCallId, params })
        return { content: [{ type: "text", text: "工具结果 OK" }] }
      },
    }

    const tool = createTaskTool({
      systemPrompt: "父系统提示词",
      model: { provider: "p", id: "m" },
      beforeToolCall: async () => undefined,
      getSignal: () => undefined,
      recordChildCall: vi.fn(),
      getTools: () => [mockTool],
    })

    // 脚本子代理响应：先 toolCall 触发内部工具，再输出最终文本。
    holder.streamResponses.push(
      { ...assistant([toolCallBlock("inner-1", "test_tool", {})]), stopReason: "toolUse" },
      assistant([{ type: "text", text: "子代理任务完成" }]),
    )

    const updates: unknown[] = []
    const result = await tool.execute(
      "parent-call-1",
      { name: "查询列表", description: "列出当前目录", prompt: "请列出当前目录的文件" },
      undefined,
      (update) => updates.push(update),
    )

    // 内部工具确实被调用。
    expect(executedCalls).toHaveLength(1)
    expect(executedCalls[0]?.toolCallId).toBe("inner-1")

    // onUpdate 每次携带完整快照（含 name/description/prompt）。
    expect(updates.length).toBeGreaterThan(0)
    for (const update of updates) {
      const subagent = (update as { details?: { subagent?: SubagentData } }).details?.subagent
      expect(subagent?.name).toBe("查询列表")
      expect(subagent?.description).toBe("列出当前目录")
      expect(subagent?.prompt).toBe("请列出当前目录的文件")
    }

    // 最终结果 details.subagent 含完整上下文、内部步骤与聚合 usage。
    const subagent = (result.details as { subagent: SubagentData }).subagent
    expect(subagent.name).toBe("查询列表")
    expect(subagent.messages.some((message) => message.role === "assistant")).toBe(true)
    expect(subagent.steps).toEqual([
      { toolName: "test_tool", args: {}, status: "done", result: "工具结果 OK" },
    ])
    expect(subagent.usage.totalTokens).toBe(0)
    // 结构化通信信元（InterAgentCommunication）
    expect(subagent.communications).toBeDefined()
    expect(subagent.communications?.length).toBe(2)
    expect(subagent.communications?.[0]?.author).toBe("orchestrator")
    expect(subagent.communications?.[0]?.recipient).toBe("subagent:查询列表")
    expect(subagent.communications?.[0]?.triggerTurn).toBe(true)
    expect(subagent.communications?.[1]?.author).toBe("subagent:查询列表")
    expect(subagent.communications?.[1]?.recipient).toBe("orchestrator")
    expect(subagent.communications?.[1]?.content).toBe("子代理任务完成")
    // 最终文本有界回传。
    expect(result.content[0]?.type).toBe("text")
  })

  it("未提供 name 时回退 task，工具执行出错记 error 步骤", async () => {
    const failingTool: AgentTool<typeof TEST_TOOL_SCHEMA> = {
      name: "fail_tool",
      label: "失败工具",
      description: "抛错工具",
      inputSchema: TEST_TOOL_SCHEMA,
      execute: async () => {
        throw new Error("boom")
      },
    }

    const tool = createTaskTool({
      systemPrompt: "父系统提示词",
      model: { provider: "p", id: "m" },
      beforeToolCall: async () => undefined,
      getSignal: () => undefined,
      recordChildCall: vi.fn(),
      getTools: () => [failingTool],
    })

    holder.streamResponses.push(
      { ...assistant([toolCallBlock("inner-2", "fail_tool", {})]), stopReason: "toolUse" },
      assistant([{ type: "text", text: "失败后总结" }]),
    )

    const result = await tool.execute("parent-call-2", {
      description: "会失败",
      prompt: "执行失败的工具",
    })

    const subagent = (result.details as { subagent: SubagentData }).subagent
    expect(subagent.name).toBe("task")
    expect(subagent.steps).toEqual([
      { toolName: "fail_tool", args: {}, status: "error", result: expect.stringContaining("boom") },
    ])
  })

  it("支持通过 subagent_id 续接已有子代理会话并累加上下文与信元", async () => {
    const { SubagentPool } = await import("@/agent/subagent/subagentPool")
    const subagentPool = new SubagentPool()

    const tool = createTaskTool({
      systemPrompt: "父系统提示词",
      model: { provider: "p", id: "m" },
      subagentPool,
      beforeToolCall: async () => undefined,
      getSignal: () => undefined,
      recordChildCall: vi.fn(),
      getTools: () => [],
    })

    // 第一轮对话
    holder.streamResponses.push(assistant([{ type: "text", text: "第一轮分析完成" }]))
    const res1 = await tool.execute("parent-call-turn1", {
      name: "analyst",
      description: "第一步分析",
      prompt: "请开始分析项目结构",
    })

    const subagent1 = (res1.details as { subagent: SubagentData }).subagent
    expect(subagent1.subagentId).toBeDefined()
    const targetSubagentId = subagent1.subagentId!
    expect(subagentPool.has(targetSubagentId)).toBe(true)
    expect(subagent1.communications).toHaveLength(2)

    // 第二轮对话（指定同一 subagent_id 进行追问续接）
    holder.streamResponses.push(assistant([{ type: "text", text: "第二轮深入结论" }]))
    const res2 = await tool.execute("parent-call-turn2", {
      subagent_id: targetSubagentId,
      description: "第二步深入",
      prompt: "基于此前的结构，请继续分析数据流",
    })

    const subagent2 = (res2.details as { subagent: SubagentData }).subagent
    expect(subagent2.subagentId).toBe(targetSubagentId)
    // 结构化通信信元累加为 4 条（轮次 1 提问+回答 + 轮次 2 提问+回答）
    expect(subagent2.communications).toHaveLength(4)
    expect(subagent2.communications?.[2]?.content).toBe("基于此前的结构，请继续分析数据流")
    expect(subagent2.communications?.[3]?.content).toBe("第二轮深入结论")
    // 内部 messages 保留并累积了两轮的用户与助手消息
    expect(subagent2.messages.filter((m) => m.role === "user")).toHaveLength(2)
    expect(subagent2.messages.filter((m) => m.role === "assistant")).toHaveLength(2)

    // 第三轮对话（容错测试：通过子代理名称 "analyst" 进行自动寻址与续接）
    holder.streamResponses.push(assistant([{ type: "text", text: "第三轮按名称续接结论" }]))
    const res3 = await tool.execute("parent-call-turn3", {
      name: "analyst",
      description: "第三步按名寻址",
      prompt: "总结一下上述两轮的结论",
    })
    const subagent3 = (res3.details as { subagent: SubagentData }).subagent
    expect(subagent3.subagentId).toBe(targetSubagentId)
    expect(subagent3.communications).toHaveLength(6)
    expect(subagent3.messages.filter((m) => m.role === "user")).toHaveLength(3)
  })
})

describe("task 子代理角色", () => {
  it("工具描述注入可用角色目录与并发上限", () => {
    const tool = createTestTool({
      settings: { roles: { custom: { description: "Custom role" } }, maxConcurrent: 4 },
    })

    expect(tool.description).toContain("Available agent types:")
    expect(tool.description).toContain("- review: Strict, uncompromising review")
    expect(tool.description).toContain("- explorer: Fast, authoritative")
    expect(tool.description).toContain("- worker: Execution and production work")
    expect(tool.description).toContain("- custom: Custom role")
    expect(tool.description).toContain("Concurrency: at most 4 subagents may run at the same time.")

    const noLimitTool = createTestTool({ settings: { roles: {} } })
    expect(noLimitTool.description).not.toContain("Concurrency:")
  })

  it("自定义角色：指令追加在末尾、角色模型生效，续接保留角色与实例", async () => {
    const pool = new SubagentPool()
    const resolveModelSelection = vi.fn(() => ({
      model: { provider: "role-p", id: "role-m" },
    }))
    const tool = createTestTool({
      pool,
      settings: {
        roles: {
          custom: {
            description: "Custom role",
            instructions: "CUSTOM ROLE INSTRUCTIONS",
            model: { provider: "role-p", model: "role-m" },
          },
        },
      },
      resolveModelSelection,
    })

    holder.streamResponses.push(assistant([{ type: "text", text: "第一轮完成" }]))
    const res1 = await tool.execute("call-role-1", {
      name: "custom-agent",
      description: "角色任务",
      prompt: "执行自定义角色任务",
      agent_type: "custom",
    })
    const id = (res1.details as { subagent: SubagentData }).subagent.subagentId!
    const managed = pool.get(id)
    const prompt = managed?.agent.state.systemPrompt ?? ""

    // 追加顺序：父提示词 → 子代理后缀 → 角色指令。
    const parentIndex = prompt.indexOf("父系统提示词")
    const suffixIndex = prompt.indexOf("You are now a sub-agent")
    const instructionsIndex = prompt.indexOf("CUSTOM ROLE INSTRUCTIONS")
    expect(parentIndex).toBe(0)
    expect(suffixIndex).toBeGreaterThan(parentIndex)
    expect(instructionsIndex).toBeGreaterThan(suffixIndex)
    expect(managed?.agent.state.model).toEqual({ provider: "role-p", id: "role-m" })
    expect(managed?.roleName).toBe("custom")
    expect(resolveModelSelection).toHaveBeenCalledTimes(1)

    // 续接不重新解析模型，复用同一 Agent 实例与角色。
    holder.streamResponses.push(assistant([{ type: "text", text: "第二轮完成" }]))
    const res2 = await tool.execute("call-role-2", {
      subagent_id: id,
      description: "续接",
      prompt: "继续",
    })
    expect(pool.get(id)?.agent).toBe(managed?.agent)
    expect(pool.get(id)?.roleName).toBe("custom")
    expect(resolveModelSelection).toHaveBeenCalledTimes(1)
    expect((res2.details as { subagent: SubagentData }).subagent.communications).toHaveLength(4)
  })

  it("角色模型解析失败降级 defaultModel 并 console.warn", async () => {
    const pool = new SubagentPool()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const tool = createTestTool({
        pool,
        settings: {
          roles: {
            custom: { description: "Custom role", model: { provider: "role-p", model: "role-m" } },
          },
          defaultModel: { provider: "default-p", model: "default-m" },
        },
        resolveModelSelection: (selection) =>
          selection.provider === "role-p"
            ? { error: "role provider missing" }
            : { model: { provider: "default-p", id: "default-m" } },
      })

      holder.streamResponses.push(assistant([{ type: "text", text: "ok" }]))
      const res = await tool.execute("call-fallback-1", {
        description: "降级",
        prompt: "p",
        agent_type: "custom",
      })
      const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
      expect(pool.get(id)?.agent.state.model).toEqual({ provider: "default-p", id: "default-m" })
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("role provider missing"))
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("角色模型与 defaultModel 均解析失败时回退父会话模型", async () => {
    const pool = new SubagentPool()
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      const tool = createTestTool({
        pool,
        settings: {
          roles: {
            custom: { description: "Custom role", model: { provider: "role-p", model: "role-m" } },
          },
          defaultModel: { provider: "default-p", model: "default-m" },
        },
        resolveModelSelection: () => ({ error: "no provider configured" }),
      })

      holder.streamResponses.push(assistant([{ type: "text", text: "ok" }]))
      const res = await tool.execute("call-fallback-2", {
        description: "降级",
        prompt: "p",
        agent_type: "custom",
      })
      const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
      expect(pool.get(id)?.agent.state.model).toEqual({ provider: "p", id: "m" })
      expect(warnSpy).toHaveBeenCalledTimes(2)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it("角色工具白名单与父工具集求交集，不新增能力", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({
      pool,
      tools: [makeTool("test_tool"), makeTool("other_tool")],
      settings: {
        roles: { limited: { description: "Limited role", tools: ["test_tool", "not_active"] } },
      },
    })

    holder.streamResponses.push(assistant([{ type: "text", text: "ok" }]))
    const res = await tool.execute("call-tools", {
      description: "工具交集",
      prompt: "p",
      agent_type: "limited",
    })
    const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
    expect(pool.get(id)?.agent.state.tools.map((item) => item.name)).toEqual(["test_tool"])
  })

  it("未知 agent_type 显式报错、列出可用角色且不消费流响应", async () => {
    holder.streamResponses.push(assistant([{ type: "text", text: "不应被消费" }]))
    const tool = createTestTool({})

    const result = await tool.execute("call-unknown", {
      description: "未知角色",
      prompt: "p",
      agent_type: "ghost",
    })

    const text = resultText(result)
    expect(text).toContain('Unknown agent_type "ghost"')
    expect(text).toContain("review, explorer, worker")
    expect(holder.streamResponses).toHaveLength(1)
  })

  it("续接携带冲突 agent_type 报错、不运行新 turn 且池内角色不变", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({
      pool,
      settings: { roles: { custom: { description: "Custom role" } } },
    })

    holder.streamResponses.push(assistant([{ type: "text", text: "创建完成" }]))
    const res1 = await tool.execute("call-resume-conflict-1", {
      name: "role-agent",
      description: "创建",
      prompt: "p1",
      agent_type: "custom",
    })
    const id = (res1.details as { subagent: SubagentData }).subagent.subagentId!
    const managedBefore = pool.get(id)

    holder.streamResponses.push(assistant([{ type: "text", text: "不应被消费" }]))
    const res2 = await tool.execute("call-resume-conflict-2", {
      subagent_id: id,
      description: "冲突续接",
      prompt: "p2",
      agent_type: "explorer",
    })

    const text = resultText(res2)
    expect(text).toContain(`agent_type cannot be changed when resuming subagent "${id}"`)
    expect(text).toContain("(role: custom)")
    expect(holder.streamResponses).toHaveLength(1)
    expect(pool.get(id)).toBe(managedBefore)
    expect(pool.get(id)?.roleName).toBe("custom")
    expect(pool.get(id)?.agent.state.messages.filter((m) => m.role === "user")).toHaveLength(1)
  })

  it("遗留 review 别名：name 含 review 的新建子代理套用内置 review 角色", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({ pool })

    holder.streamResponses.push(assistant([{ type: "text", text: "review 完成" }]))
    const res = await tool.execute("call-review", {
      name: "review-agent",
      description: "评审",
      prompt: "评审这段变更",
    })
    const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
    const managed = pool.get(id)
    const prompt = managed?.agent.state.systemPrompt ?? ""

    expect(prompt.startsWith("父系统提示词\n\nYou are now a sub-agent")).toBe(true)
    expect(prompt).toContain(REVIEW_AGENT_SYSTEM_PROMPT)
    expect(prompt.indexOf(REVIEW_AGENT_SYSTEM_PROMPT)).toBeGreaterThan(
      prompt.indexOf("You are now a sub-agent"),
    )
    expect(managed?.roleName).toBe("review")
  })

  it("默认子代理：仅父提示词 + 子代理后缀，无角色指令", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({ pool })

    holder.streamResponses.push(assistant([{ type: "text", text: "ok" }]))
    const res = await tool.execute("call-default", {
      name: "plain-agent",
      description: "默认",
      prompt: "p",
    })
    const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
    const managed = pool.get(id)
    const prompt = managed?.agent.state.systemPrompt ?? ""

    expect(prompt.startsWith("父系统提示词\n\nYou are now a sub-agent")).toBe(true)
    expect(prompt).not.toContain("## Review Rubric")
    expect(managed?.roleName).toBeUndefined()
  })
})

describe("task 子代理并发治理", () => {
  it("占满槽位时拒绝且不消费流，释放后可执行并在结束后归还槽位", async () => {
    const runtime = new SubagentRuntime(1)
    const pool = new SubagentPool()
    const tool = createTestTool({ pool, runtime })

    // 预占唯一槽位；早退校验（未知角色）仍先于并发检查，不占用新槽位。
    runtime.tryAcquire()
    const unknown = await tool.execute("call-limit-unknown", {
      description: "未知角色",
      prompt: "p",
      agent_type: "ghost",
    })
    expect(resultText(unknown)).toContain('Unknown agent_type "ghost"')
    expect(runtime.active).toBe(1)

    holder.streamResponses.push(assistant([{ type: "text", text: "不应被消费" }]))
    const rejected = await tool.execute("call-limit-reject", {
      name: "limited-agent",
      description: "并发拒绝",
      prompt: "p",
    })
    expect(resultText(rejected)).toBe(
      "Concurrency limit reached: 1/1 subagents running. Reuse an existing subagent (subagent_id) or wait for one to finish before spawning more.",
    )
    expect(holder.streamResponses).toHaveLength(1)
    expect(pool.list()).toHaveLength(0)

    // 释放后可再次执行（turn 正常结束路径）。
    runtime.release()
    const accepted = await tool.execute("call-limit-accept", {
      name: "limited-agent",
      description: "并发通过",
      prompt: "p2",
    })
    expect(resultText(accepted)).toContain("不应被消费")
    expect(resultText(accepted)).toContain("[Subagent ID:")
    expect(pool.list()).toHaveLength(1)
    expect(runtime.active).toBe(0)

    // 槽位已在 finally 归还：可立即再次占用。
    expect(runtime.tryAcquire()).toBe(true)
    runtime.release()
  })
})

describe("task 子代理嵌套深度", () => {
  it("缺省 maxDepth=1：子代理工具集不含 task", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({ pool, tools: [makeTool("echo")] })

    holder.streamResponses.push(assistant([{ type: "text", text: "ok" }]))
    const res = await tool.execute("call-depth-default", {
      name: "child",
      description: "默认深度",
      prompt: "p",
    })
    const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
    expect(pool.get(id)?.agent.state.tools.map((item) => item.name)).toEqual(["echo"])
  })

  it("maxDepth=2：注入嵌套 task，调用后派生孙代理且孙代理达到深度上限", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({
      pool,
      tools: [makeTool("echo")],
      settings: { roles: {}, maxDepth: 2 },
    })

    holder.streamResponses.push(assistant([{ type: "text", text: "child done" }]))
    const res = await tool.execute("call-depth2", {
      name: "child",
      description: "深度二",
      prompt: "p",
    })
    const childId = (res.details as { subagent: SubagentData }).subagent.subagentId!
    const child = pool.get(childId)
    expect(child?.agent.state.tools.map((item) => item.name)).toEqual(["echo", "task"])

    // 通过子代理工具集中的嵌套 task 实例派生孙代理。
    const nested = child?.agent.state.tools.find((item) => item.name === "task")
    expect(nested).toBeDefined()
    holder.streamResponses.push(assistant([{ type: "text", text: "grandchild done" }]))
    const nestedResult = await nested!.execute("nested-call-1", {
      name: "grandchild",
      description: "孙代理",
      prompt: "gp",
    })

    expect(resultText(nestedResult)).toContain("grandchild done")
    expect(resultText(nestedResult)).toContain("[Subagent ID:")
    expect(pool.list()).toHaveLength(2)
    const grandchild = pool.list().find((item) => item.subagentId !== childId)
    expect(grandchild?.agent.state.tools.map((item) => item.name)).toEqual(["echo"])
  })

  it("maxDepth=2 且角色白名单不含 task：不注入嵌套 task", async () => {
    const pool = new SubagentPool()
    const tool = createTestTool({
      pool,
      tools: [makeTool("echo"), makeTool("other")],
      settings: {
        roles: { limited: { description: "Limited role", tools: ["echo"] } },
        maxDepth: 2,
      },
    })

    holder.streamResponses.push(assistant([{ type: "text", text: "ok" }]))
    const res = await tool.execute("call-depth2-limited", {
      name: "limited-child",
      description: "白名单排除",
      prompt: "p",
      agent_type: "limited",
    })
    const id = (res.details as { subagent: SubagentData }).subagent.subagentId!
    expect(pool.get(id)?.agent.state.tools.map((item) => item.name)).toEqual(["echo"])
  })
})
