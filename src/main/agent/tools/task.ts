import type {
  AgentMessage,
  AssistantMessage,
  InterAgentCommunication,
  SandboxPolicy,
  SubagentData,
  SubagentStep,
  TextContent,
  Usage,
} from "@shared/contracts/agent"
import { z } from "zod"
import { Agent } from "../core/agent"
import type { AgentTool, BeforeToolCallContext, BeforeToolCallResult, Model } from "../core/types"
import { spillManager } from "../spill/spillManager"
import { createAiSdkStreamFn } from "../stream/aiSdkStreamFn"
import { DEFAULT_MAX_BYTES, truncateTail } from "./truncate"

// 子代理系统提示词后缀（追加在父系统提示词之后）。
const SUBAGENT_PROMPT_SUFFIX = [
  "You are now a sub-agent focused on completing the delegated independent sub-task.",
  "Only use tools necessary to complete the task; stop immediately after achieving the goal and briefly summarize the result.",
  "Do not perform unnecessary exploration beyond the task scope.",
  "Adhere strictly to the inherited sandbox policy and safety constraints.",
].join("\n")

import type { SubagentPool } from "../subagent/subagentPool"

// 子代理最终输出超限阈值（写 spill 文件，父上下文只收有界预览 + 路径标记）。
const SUBAGENT_MAX_BYTES = DEFAULT_MAX_BYTES

// task 工具输入 schema（对齐 Codex multi_agents 协议）。
const TASK_INPUT_SCHEMA = z.object({
  description: z.string().describe("Brief task description (1-5 words) for progress display"),
  prompt: z
    .string()
    .describe("Complete task prompt to delegate to the sub-agent, must include sufficient context"),
  name: z.string().optional().describe("Sub-agent name or role (e.g., 'code-explorer' / 'coder')"),
  subagent_id: z
    .string()
    .optional()
    .describe(
      "Subagent ID or name from a previous task call to resume the same sub-agent session with its full context history (e.g., 'subagent-1787802448377-dz12z' or 'code-explorer')",
    ),
})

export type TaskInput = z.infer<typeof TASK_INPUT_SCHEMA>

// 子代理工具结果 details（挂落库数据 + 恢复重建弹窗数据）。
export interface SubagentDetails {
  subagent: SubagentData
}

// 工具执行结果 → 摘要文本（供步骤时间轴展示）。
const summarizeToolResult = (result: unknown): string | undefined => {
  if (!result || typeof result !== "object") return undefined
  const content = (result as { content?: Array<{ type?: string; text?: string }> }).content
  const text = content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim()
    .replace(/\s+/g, " ")
  if (!text) return undefined
  return text.length > 96 ? `${text.slice(0, 96)}…` : text
}

// 子代理内部工具调用记录输入（provenance 落库；runner 负责截断与写库）。
export interface ChildCallInput {
  toolCallId: string
  toolName: string
  args: unknown
  status: "running" | "success" | "error" | "aborted"
  result?: unknown
  startedAt: number
  finishedAt: number | null
}

// task 工具依赖（agentRunner 装配时注入；execute 时解析）。
export interface TaskToolDeps {
  // 父系统提示词（子代理在其后追加子代理前缀）。
  systemPrompt: string
  // 父会话模型（子代理沿用）。
  model: Model
  // 父会话沙箱策略（继承至子代理）。
  sandboxPolicy?: SandboxPolicy
  // 会话级子代理池（跨轮次复用 Agent 实例）。
  subagentPool?: SubagentPool
  // 父权限门控（子代理内部工具复用同一 permissionManager.gate，不豁免）。
  beforeToolCall: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  // 父 run 的 abort signal（级联中止子代理）。
  getSignal: () => AbortSignal | undefined
  // 记录子代理内部工具调用（parent_call_id 指向触发它的父 task 调用行；与父 turn 同事务落库）。
  recordChildCall: (parentToolCallId: string, child: ChildCallInput) => void
  // 可选当前会话 ID
  getSessionId?: () => string | null
}

// 子代理最终文本有界化：未超限原样返回；超限截断 + 完整内容写 spill 文件。
const boundSubagentOutput = (
  text: string,
  options?: { sessionId?: string; toolCallId?: string },
): { content: string; filePath?: string } => {
  const truncated = truncateTail(text, { maxBytes: SUBAGENT_MAX_BYTES })
  if (!truncated.truncated) return { content: text }
  const { text: content, spillFilePath: filePath } = spillManager.handleTruncation(
    text,
    truncated,
    {
      sessionId: options?.sessionId,
      toolCallId: options?.toolCallId,
      customActionHint: "Use 'read' tool to inspect the full subagent output.",
    },
  )
  return { content, filePath }
}

// 提取子代理最新一轮（或指定起始索引）的助手文本（最终输出）与错误信息。
const extractSubagentResult = (
  messages: AgentMessage[],
  startIndex = 0,
): { text: string; error?: string } => {
  const targetMessages = messages.slice(startIndex)
  const text = targetMessages
    .filter((message) => message.role === "assistant")
    .flatMap((message) =>
      message.content
        .filter((block): block is TextContent => block.type === "text")
        .map((block) => block.text),
    )
    .filter(Boolean)
    .join("\n\n")
  const error = targetMessages
    .filter(
      (message): message is AssistantMessage =>
        message.role === "assistant" && message.errorMessage !== undefined,
    )
    .map((message) => message.errorMessage)
    .filter((value): value is string => Boolean(value))
    .at(-1)
  return { text, error }
}

// 聚合子代理全部助手消息的 token 用量（审计/展示用）。
const aggregateUsage = (messages: AgentMessage[]): Usage => {
  return messages
    .filter((message) => message.role === "assistant")
    .reduce<Usage>(
      (total, message) => ({
        input: total.input + message.usage.input,
        output: total.output + message.usage.output,
        cacheRead: total.cacheRead + message.usage.cacheRead,
        totalTokens: total.totalTokens + message.usage.totalTokens,
      }),
      { input: 0, output: 0, cacheRead: 0, totalTokens: 0 },
    )
}

/**
 * 创建 task 工具：委托独立子任务到进程内嵌套 Agent。
 *
 * 子代理在同一 cwd 内以独立上下文运行自己的工具循环（复用父权限门控与沙箱策略），
 * 结构化交互对齐 Codex InterAgentCommunication 规范（author / recipient / triggerTurn）。
 */
export const createTaskTool = (
  deps: TaskToolDeps & { getTools: () => AgentTool<any>[] },
): AgentTool<typeof TASK_INPUT_SCHEMA> => {
  const subAgentPrompt = `${deps.systemPrompt}\n\n${SUBAGENT_PROMPT_SUFFIX}`

  return {
    name: "task",
    label: "Subagent",
    description:
      "Delegate an independent sub-task to a sub-agent (e.g., parallel search, independent exploration, long-running command execution). " +
      "The sub-agent runs its own tool loop in an independent context, returning the final text as the result. " +
      "Use when a task can be decomposed into independent sub-tasks; do not delegate tasks that require parent context decisions.",
    inputSchema: TASK_INPUT_SCHEMA,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // 1. 优先通过 subagent_id 或 name 寻址解析已有子代理
      const lookupKey = params.subagent_id?.trim() || params.name?.trim()
      const existingManaged = lookupKey ? deps.subagentPool?.resolve(lookupKey) : undefined

      // 2. 确定真实的 subagentId（复用已有 id 或为新子代理分配唯一 id）
      const subagentId =
        existingManaged?.subagentId ??
        params.subagent_id?.trim() ??
        `subagent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

      const subAgent =
        existingManaged?.agent ??
        new Agent({
          streamFn: createAiSdkStreamFn(),
          beforeToolCall: deps.beforeToolCall,
          initialState: {
            systemPrompt: subAgentPrompt,
            model: deps.model,
            // 子代理工具集 = 父激活集去 task（斩断递归嵌套；含 web_search）。
            tools: deps.getTools().filter((tool) => tool.name !== "task"),
          },
        })

      // 子代理名（AI 分发；优先用参数，其次复用旧名，缺失回退 "task"）。
      const subagentName = params.name?.trim() || existingManaged?.name || "task"
      const recipientName = `subagent:${subagentName}`
      const orchestratorName = "orchestrator"

      // 结构化通信信元列表（从已有子代理历史中继承并追加）
      const communications: InterAgentCommunication[] = existingManaged?.data?.communications
        ? [...existingManaged.data.communications]
        : []

      communications.push({
        id: `comm-turn-${Date.now()}`,
        author: orchestratorName,
        recipient: recipientName,
        content: params.prompt,
        triggerTurn: true,
        metadata: {
          subagentId,
          description: params.description,
          timestamp: Date.now(),
        },
      })

      // 工具步骤（按 toolCallId 定位，继承已有步骤并追加新步骤）。
      const steps = new Map<string, SubagentStep>()
      if (existingManaged?.data?.steps) {
        existingManaged.data.steps.forEach((s, idx) => {
          steps.set(`historical-${idx}`, s)
        })
      }

      // 聚合子代理完整上下文（已提交 + 正在流式消息）。
      const collectMessages = (): AgentMessage[] => {
        const messages = subAgent.state.messages.slice()
        const streaming = subAgent.state.streamingMessage
        if (streaming) messages.push(streaming)
        return messages
      }

      // 构建 SubagentData 快照（每次子代理事件推一次，renderer 覆盖不做增量合并）。
      const buildSubagentData = (filePath?: string): SubagentData => ({
        subagentId,
        name: subagentName,
        description: params.description,
        prompt: params.prompt,
        communications: [...communications],
        sandboxPolicy: deps.sandboxPolicy,
        messages: collectMessages(),
        steps: [...steps.values()],
        usage: aggregateUsage(subAgent.state.messages),
        ...(filePath ? { filePath } : {}),
      })

      const startIndex = subAgent.state.messages.length

      // 子代理事件 → 快照桥接：内部步骤始终捕获，onUpdate 存在时回传快照。
      const unsubscribe = subAgent.subscribe((event) => {
        let progress: TextContent | undefined
        switch (event.type) {
          case "message_update":
            // 流式文本增量（父消息流进度文本；子代理面板以 messages 为准）。
            if (event.message.role === "assistant") {
              const text = event.message.content
                .filter((block): block is TextContent => block.type === "text")
                .map((block) => block.text)
                .join("")
              if (text) progress = { type: "text", text }
            }
            break

          case "tool_execution_start": {
            steps.set(event.toolCallId, {
              toolName: event.toolName,
              args: (event.args as Record<string, unknown>) ?? {},
              status: "running",
            })
            // provenance：子代理内部调用写 agent_call（parent_call_id 指父 task 调用行）。
            deps.recordChildCall(toolCallId, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              args: event.args,
              status: "running",
              startedAt: Date.now(),
              finishedAt: null,
            })
            break
          }

          case "tool_execution_end": {
            const step = steps.get(event.toolCallId)
            if (step) {
              step.status = event.isError ? "error" : "done"
              step.result = summarizeToolResult(event.result)
            }
            deps.recordChildCall(toolCallId, {
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              // end 事件不带 args：复用 start 时缓存的步骤参数。
              args: step?.args ?? {},
              status: event.isError ? "error" : "success",
              result: event.result,
              startedAt: Date.now(),
              finishedAt: Date.now(),
            })
            break
          }
        }
        if (!onUpdate) return
        onUpdate({
          content: progress ? [progress] : [],
          details: { subagent: buildSubagentData() },
        })
      })
      // 父 run abort → 子代理级联中止。
      const onAbort = (): void => subAgent.abort()
      signal?.addEventListener("abort", onAbort, { once: true })
      try {
        await subAgent.prompt(params.prompt)
      } finally {
        unsubscribe()
        signal?.removeEventListener("abort", onAbort)
      }

      const { text, error } = extractSubagentResult(subAgent.state.messages, startIndex)
      
      // 子代理产出最终结论，回传结构化通信信元
      communications.push({
        id: `comm-done-${Date.now()}`,
        author: recipientName,
        recipient: orchestratorName,
        content: text || (error ? `Error: ${error}` : ""),
        triggerTurn: false,
        metadata: {
          status: error ? "error" : "done",
          timestamp: Date.now(),
        },
      })

      const details: SubagentDetails = { subagent: buildSubagentData() }

      // 在会话池中登记/更新该子代理实例与历史快照数据
      deps.subagentPool?.set(subagentId, {
        subagentId,
        name: subagentName,
        agent: subAgent,
        data: details.subagent,
        createdAt: existingManaged?.createdAt ?? Date.now(),
        lastActiveAt: Date.now(),
      })

      let content: string
      if (text) {
        const sessionId = deps.getSessionId?.() ?? undefined
        const bounded = boundSubagentOutput(text, { sessionId, toolCallId })
        content = `${bounded.content}\n\n[Subagent ID: ${subagentId}]`
        if (bounded.filePath) details.subagent.filePath = bounded.filePath
      } else if (error) {
        content = `Subagent execution failed: ${error}\n\n[Subagent ID: ${subagentId}]`
      } else {
        content = `(Subagent produced no text output)\n\n[Subagent ID: ${subagentId}]`
      }
      return { content: [{ type: "text", text: content }], details }
    },
  }
}
