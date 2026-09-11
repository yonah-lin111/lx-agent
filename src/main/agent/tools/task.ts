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
import type { ModelSelection, SubagentSettings } from "@shared/settings"
import { DEFAULT_SUBAGENT_SETTINGS } from "@shared/settings"
import { z } from "zod"
import { Agent } from "../core/agent"
import type { AgentTool, BeforeToolCallContext, BeforeToolCallResult, Model } from "../core/types"
import { hookResultMessages, hooksManager } from "../hooks"
import { spillManager } from "../spill/spillManager"
import { createAiSdkStreamFn } from "../stream/aiSdkStreamFn"
import { resolveModelSelection as defaultResolveModelSelection } from "../stream/modelFactory"
import {
  buildAgentTypesDescription,
  type ResolvedAgentRole,
  resolveAgentRoles,
} from "../subagent/agentRoles"
import { DEFAULT_MAX_BYTES, truncateTail } from "./truncate"

// 子代理系统提示词后缀（追加在父系统提示词之后）。
const SUBAGENT_PROMPT_SUFFIX = [
  "You are now a sub-agent focused on completing the delegated independent sub-task.",
  "Only use tools necessary to complete the task; stop immediately after achieving the goal and briefly summarize the result.",
  "Do not perform unnecessary exploration beyond the task scope.",
  "Adhere strictly to the inherited sandbox policy and safety constraints.",
].join("\n")

import type { SubagentPool } from "../subagent/subagentPool"
import { SubagentRuntime } from "../subagent/subagentRuntime"

// 子代理最终输出超限阈值（写 spill 文件，父上下文只收有界预览 + 路径标记）。
const SUBAGENT_MAX_BYTES = DEFAULT_MAX_BYTES

// task 工具输入 schema（对齐 Codex multi_agents 协议）。
const TASK_INPUT_SCHEMA = z.object({
  description: z.string().describe("Brief task description (1-5 words) for progress display"),
  prompt: z
    .string()
    .describe("Complete task prompt to delegate to the sub-agent, must include sufficient context"),
  agent_type: z.string().optional().describe("Agent role name from the Available agent types list"),
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
  // 可选当前会话 cwd（Subagent hook 的 LX_CWD）。
  getCwd?: () => string | undefined
  // 会话级子代理设置快照（角色目录 / 默认模型 / 并发上限）。
  subagentSettings?: SubagentSettings
  // 会话级并发槽位（缺省：每个工厂实例独立一个，行为与旧版一致）。
  subagentRuntime?: SubagentRuntime
  // 当前嵌套深度（根会话为 0；用于决定是否注入嵌套 task）。
  depth?: number
  // 角色模型解析器（默认复用 modelFactory.resolveModelSelection）。
  resolveModelSelection?: (selection: ModelSelection) => { model: Model } | { error: string }
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
        // 旧持久化消息无 cacheWrite 字段，按 0 兼容。
        cacheWrite: total.cacheWrite + (message.usage.cacheWrite ?? 0),
        totalTokens: total.totalTokens + message.usage.totalTokens,
      }),
      { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 },
    )
}

// task 工具基础描述（角色目录与并发治理在装配时追加）。
const BASE_DESCRIPTION =
  "Delegate an independent sub-task to a sub-agent (e.g., parallel search, independent exploration, long-running command execution). " +
  "The sub-agent runs its own tool loop in an independent context, returning the final text as the result. " +
  "Use when a task can be decomposed into independent sub-tasks; do not delegate tasks that require parent context decisions."

/**
 * 创建 task 工具：委托独立子任务到进程内嵌套 Agent。
 *
 * 子代理在同一 cwd 内以独立上下文运行自己的工具循环（复用父权限门控与沙箱策略），
 * 结构化交互对齐 Codex InterAgentCommunication 规范（author / recipient / triggerTurn）。
 */
export const createTaskTool = (
  deps: TaskToolDeps & { getTools: () => AgentTool<any>[] },
): AgentTool<typeof TASK_INPUT_SCHEMA> => {
  const settings = deps.subagentSettings ?? DEFAULT_SUBAGENT_SETTINGS
  const roles = resolveAgentRoles(settings)
  const resolveSelection = deps.resolveModelSelection ?? defaultResolveModelSelection
  const runtime = deps.subagentRuntime ?? new SubagentRuntime(settings.maxConcurrent)
  const maxDepth = settings.maxDepth ?? 1
  const concurrencyNote = settings.maxConcurrent
    ? `\n\nConcurrency: at most ${settings.maxConcurrent} subagents may run at the same time. Reuse existing subagents or wait for their completion before spawning more.`
    : ""

  return {
    name: "task",
    label: "Subagent",
    description: `${BASE_DESCRIPTION}\n\n${buildAgentTypesDescription(roles.values())}${concurrencyNote}`,
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

      const subagentName = params.name?.trim() || existingManaged?.name || "task"

      // 3. 角色解析：续接角色不可变；新建按 agent_type > 遗留 review 别名 > 默认子代理。
      const requestedType = params.agent_type?.trim()
      let role: ResolvedAgentRole | undefined
      if (existingManaged) {
        const existingRoleName = existingManaged.roleName
        if (requestedType && requestedType !== existingRoleName) {
          return {
            content: [
              {
                type: "text",
                text: `agent_type cannot be changed when resuming subagent "${subagentId}" (role: ${existingRoleName ?? "default"}). Existing subagents keep their role for their lifetime.`,
              },
            ],
          }
        }
        role = existingRoleName ? roles.get(existingRoleName) : undefined
      } else if (requestedType) {
        role = roles.get(requestedType)
        if (!role) {
          return {
            content: [
              {
                type: "text",
                text: `Unknown agent_type "${requestedType}". Available agent types: ${[...roles.keys()].join(", ")}.`,
              },
            ],
          }
        }
      } else if (params.name?.toLowerCase().includes("review")) {
        // 遗留别名：name 含 review 映射到内置 review 角色（仅新建生效）。
        role = roles.get("review")
      }

      const roleName = role?.name ?? existingManaged?.roleName

      // 4. 并发槽位：所有早退校验之后、启动子代理 turn 之前占用；失败不消费流。
      if (!runtime.tryAcquire()) {
        return {
          content: [
            {
              type: "text",
              text: `Concurrency limit reached: ${runtime.active}/${runtime.limit} subagents running. Reuse an existing subagent (subagent_id) or wait for one to finish before spawning more.`,
            },
          ],
        }
      }

      try {
        // 5. 子代理实例：续接复用池内实例（角色/模型/工具与创建时一致），否则按角色新建。
        let subAgent = existingManaged?.agent
        if (!subAgent) {
          // 系统提示词追加顺序：父提示词 → 子代理后缀 → 角色指令。
          const effectivePrompt = role?.instructions
            ? `${deps.systemPrompt}\n\n${SUBAGENT_PROMPT_SUFFIX}\n\n${role.instructions}`
            : `${deps.systemPrompt}\n\n${SUBAGENT_PROMPT_SUFFIX}`

          // 工具集 = 父激活集去 task，再与角色白名单求交集（永不新增能力）。
          const parentTools = deps.getTools().filter((tool) => tool.name !== "task")
          const roleToolNames = role?.tools
          const childTools: AgentTool<any>[] =
            roleToolNames === undefined
              ? parentTools
              : parentTools.filter((tool) => roleToolNames.includes(tool.name))

          // 模型优先级：role.model → defaultModel → 父会话模型；解析失败告警并降级。
          const resolveChildModel = (): Model => {
            if (role?.model) {
              const resolved = resolveSelection(role.model)
              if ("model" in resolved) return resolved.model
              console.warn(
                `Failed to resolve model for subagent role "${role.name}": ${resolved.error}. Falling back to the default subagent model.`,
              )
            }
            if (settings.defaultModel) {
              const resolved = resolveSelection(settings.defaultModel)
              if ("model" in resolved) return resolved.model
              console.warn(
                `Failed to resolve default subagent model: ${resolved.error}. Falling back to the parent session model.`,
              )
            }
            return deps.model
          }

          const childModel = resolveChildModel()
          const childDepth = (deps.depth ?? 0) + 1

          // 深度允许且角色未排除 task 时注入嵌套 task；getTools 读取同一活数组，避免循环引用。
          if (
            childDepth < maxDepth &&
            (roleToolNames === undefined || roleToolNames.includes("task"))
          ) {
            childTools.push(
              createTaskTool({
                ...deps,
                systemPrompt: effectivePrompt,
                model: childModel,
                depth: childDepth,
                subagentRuntime: runtime,
                getTools: () => childTools,
              }),
            )
          }

          subAgent = new Agent({
            streamFn: createAiSdkStreamFn({
              purpose: "subagent",
              getSessionId: () => deps.getSessionId?.() ?? null,
            }),
            beforeToolCall: deps.beforeToolCall,
            initialState: {
              systemPrompt: effectivePrompt,
              model: childModel,
              tools: childTools,
            },
          })
        }

        // 子代理名（AI 分发；优先用参数，其次复用旧名，缺失回退 "task"）。
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

        // SubagentStart hook：additionalContext 仅注入子代理自身上下文；agent_type 使用解析后的角色名。
        const hookSessionId = deps.getSessionId?.() ?? null
        const hookCwd = deps.getCwd?.() ?? process.cwd()
        const startHookMessages = hookResultMessages(
          await hooksManager.dispatch({
            event: "SubagentStart",
            sessionId: hookSessionId,
            cwd: hookCwd,
            payload: {
              agent_id: subagentId,
              agent_type: roleName ?? subagentName,
              task: params.prompt,
            },
          }),
        )

        try {
          const userMessage: AgentMessage = {
            role: "user",
            content: params.prompt,
            timestamp: Date.now(),
          }
          await subAgent.prompt(
            startHookMessages.length > 0 ? [...startHookMessages, userMessage] : userMessage,
          )
        } finally {
          unsubscribe()
          signal?.removeEventListener("abort", onAbort)
        }

        const { text, error } = extractSubagentResult(subAgent.state.messages, startIndex)

        // SubagentStop hook：成功/失败/中止状态审计；消息仅进入子代理自身历史（面板展示）。
        const subagentStatus = signal?.aborted ? "aborted" : error ? "error" : "done"
        const stopHookMessages = hookResultMessages(
          await hooksManager.dispatch({
            event: "SubagentStop",
            sessionId: hookSessionId,
            cwd: hookCwd,
            payload: {
              agent_id: subagentId,
              agent_type: roleName ?? subagentName,
              status: subagentStatus,
            },
          }),
        )
        if (stopHookMessages.length > 0) {
          subAgent.state.messages.push(...stopHookMessages)
        }

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

        // 在会话池中登记/更新该子代理实例与历史快照数据（续接保留已固定角色）。
        deps.subagentPool?.set(subagentId, {
          subagentId,
          name: subagentName,
          agent: subAgent,
          data: details.subagent,
          createdAt: existingManaged?.createdAt ?? Date.now(),
          lastActiveAt: Date.now(),
          ...(roleName ? { roleName } : {}),
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
      } finally {
        runtime.release()
      }
    },
  }
}
