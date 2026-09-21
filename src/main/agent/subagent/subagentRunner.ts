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
import { Agent } from "../core/agent"
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
  Model,
  ToolHookResult,
} from "../core/types"
import { hookResultMessages, hooksManager } from "../hooks"
import { spillManager } from "../spill/spillManager"
import { createAiSdkStreamFn } from "../stream/aiSdkStreamFn"
import { resolveModelSelection as defaultResolveModelSelection } from "../stream/modelFactory"
import { DEFAULT_MAX_BYTES, truncateTail } from "../tools/truncate"
import type { ResolvedAgentRole } from "./agentRoles"
import type { ManagedSubagent, SubagentPool } from "./subagentPool"
import { filterToolsByPermissions } from "./toolPermissions"

// 子代理系统提示词后缀（追加在父系统提示词之后）。
const SUBAGENT_PROMPT_SUFFIX = [
  "You are now a sub-agent focused on completing the delegated independent sub-task.",
  "Only use tools necessary to complete the task; stop immediately after achieving the goal and briefly summarize the result.",
  "Do not perform unnecessary exploration beyond the task scope.",
  "Adhere strictly to the inherited sandbox policy and safety constraints.",
].join("\n")

// 子代理最终输出超限阈值（写 spill 文件，父上下文只收有界预览 + 路径标记）。
const SUBAGENT_MAX_BYTES = DEFAULT_MAX_BYTES

// 空补全（正常结束但零输出）在同一 dispatch 内的最大续跑重试次数。
const SUBAGENT_EMPTY_OUTPUT_MAX_RETRIES = 2

// 子代理内部工具调用记录输入（provenance 落库；turnStore 负责截断与写库）。
export interface ChildCallInput {
  toolCallId: string
  toolName: string
  args: unknown
  status: "running" | "success" | "error" | "aborted"
  result?: unknown
  startedAt: number
  finishedAt: number | null
}

// 子代理运行依赖（task 工具装配时注入）。
export interface SubagentRunnerDeps {
  // 子代理基座系统提示词（已按子代理协作模式渲染；子代理在其后追加子代理前缀）。
  subagentSystemPrompt: string
  // 按角色技能白名单渲染子代理系统提示词（undefined = 不限制，继承父会话技能集）。
  renderSubagentSystemPrompt?: (allowedSkills: string[] | undefined) => string
  // 父会话模型（子代理沿用）。
  model: Model
  // 父会话沙箱策略（继承至子代理）。
  sandboxPolicy?: SandboxPolicy
  // 会话级子代理池（跨轮次复用 Agent 实例）。
  subagentPool?: SubagentPool
  // 子代理权限门控（复用父 permissionManager.gate；协作模式按子代理配置绑定，不继承主 agent）。
  beforeToolCall: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  // 子代理工具结果收尾（重复调用提醒附加；与主代理一致）。
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>
  // 子代理 PreToolUse hook（与主代理一致；可阻断并注入审计消息）。
  preToolUse?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<ToolHookResult | undefined>
  // 子代理 PostToolUse hook（与主代理一致；仅注入审计消息）。
  postToolUse?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<ToolHookResult | undefined>
  // 记录子代理内部工具调用（parent_call_id 指向触发它的父 task 调用行；与父 turn 同事务落库）。
  recordChildCall: (parentToolCallId: string, child: ChildCallInput) => void
  // 可选当前会话 ID
  getSessionId?: () => string | null
  // 可选当前会话 cwd（Subagent hook 的 LX_CWD）。
  getCwd?: () => string | undefined
  // 会话级子代理设置快照（角色目录 / 默认模型 / 并发上限）。
  subagentSettings?: SubagentSettings
  // 角色模型解析器（默认复用 modelFactory.resolveModelSelection）。
  resolveModelSelection?: (selection: ModelSelection) => { model: Model } | { error: string }
  // 子代理可继承的工具集（父激活集）。
  getTools: () => AgentTool<any>[]
  // 嵌套 task 工厂：达到深度上限前由 runner 按需注入（task.ts 注入自身实现，避免循环依赖）。
  createNestedTaskTool?: (options: {
    systemPrompt: string
    model: Model
    depth: number
    getTools: () => AgentTool<any>[]
  }) => AgentTool<any>
}

// 单次子代理运行请求（单任务与批量扇出共用）。
export interface SubagentRunRequest {
  // 触发本次运行的父 task 工具调用 id（provenance 归属与 spill 命名）。
  toolCallId: string
  subagentId: string
  description: string
  prompt: string
  // 展示名（AI 分发；缺省回退角色名 / "task"）。
  name: string
  // 已解析角色（缺省 = 默认子代理）。
  role?: ResolvedAgentRole
  // 固定角色名（续接沿用创建时角色）。
  roleName?: string
  // 续接：池内已有实例（复用 Agent 与角色，继续追加通信信元）。
  existing?: ManagedSubagent
  // 调用方深度（根会话为 0）；子代理深度 = depth + 1。
  depth: number
}

// 单次子代理运行结果（批量模式下按输入顺序聚合回传）。
export interface SubagentRunResult {
  subagentId: string
  name: string
  roleName?: string
  status: "done" | "error" | "aborted"
  text: string
  error?: string
  // 最终输出超限时完整结果落盘路径。
  filePath?: string
  // 运行时快照（中止于启动前时缺省）。
  data?: SubagentData
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

/**
 * 运行一次子代理：创建/复用 Agent，执行一轮 prompt，返回最终文本与完整快照。
 *
 * 槽位获取与释放由调用方（task 工具）负责；本函数只在获得槽位后执行。
 */
export const runSubagent = async (
  deps: SubagentRunnerDeps,
  request: SubagentRunRequest,
  signal: AbortSignal | undefined,
  // 快照按需构建：调用方在节流 flush 时才调用 builder（避免每次流式增量全量快照）。
  onSnapshot?: (snapshot: () => SubagentData, progress?: TextContent) => void,
): Promise<SubagentRunResult> => {
  const settings = deps.subagentSettings ?? DEFAULT_SUBAGENT_SETTINGS
  const resolveSelection = deps.resolveModelSelection ?? defaultResolveModelSelection
  const maxDepth = settings.maxDepth ?? 1
  const { subagentId, existing, role } = request
  const roleName = role?.name ?? request.roleName
  const subagentName = request.name

  // 子代理实例：续接复用池内实例（角色/模型/工具与创建时一致），否则按角色新建。
  let subAgent = existing?.agent
  if (!subAgent) {
    const permissions = role?.permissions
    const allowedSkills = permissions?.skills

    // 系统提示词追加顺序：子代理基座提示词 → 子代理后缀 → 角色指令。
    // 角色配置技能白名单时，基座提示词的 available_skills 同步收窄（与工具同源）。
    const basePrompt = allowedSkills
      ? (deps.renderSubagentSystemPrompt?.(allowedSkills) ?? deps.subagentSystemPrompt)
      : deps.subagentSystemPrompt
    const effectivePrompt = role?.instructions
      ? `${basePrompt}\n\n${SUBAGENT_PROMPT_SUFFIX}\n\n${role.instructions}`
      : `${basePrompt}\n\n${SUBAGENT_PROMPT_SUFFIX}`

    // 工具集 = 父激活集去 task，再与角色权限求交集（永不新增能力）。
    const parentTools = deps.getTools().filter((tool) => tool.name !== "task")
    const childTools: AgentTool<any>[] = filterToolsByPermissions(parentTools, permissions)

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
    const childDepth = request.depth + 1

    // 深度允许且角色未排除 task 时注入嵌套 task；getTools 读取同一活数组，避免循环引用。
    if (
      childDepth < maxDepth &&
      (permissions?.tools === undefined || permissions.tools.includes("task")) &&
      deps.createNestedTaskTool
    ) {
      childTools.push(
        deps.createNestedTaskTool({
          systemPrompt: effectivePrompt,
          model: childModel,
          depth: childDepth,
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
      afterToolCall: deps.afterToolCall,
      preToolUse: deps.preToolUse,
      postToolUse: deps.postToolUse,
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
  const communications: InterAgentCommunication[] = existing?.data?.communications
    ? [...existing.data.communications]
    : []

  communications.push({
    id: `comm-turn-${Date.now()}`,
    author: orchestratorName,
    recipient: recipientName,
    content: request.prompt,
    triggerTurn: true,
    metadata: {
      subagentId,
      description: request.description,
      timestamp: Date.now(),
    },
  })

  // 工具步骤（按 toolCallId 定位，继承已有步骤并追加新步骤）。
  const steps = new Map<string, SubagentStep>()
  if (existing?.data?.steps) {
    existing.data.steps.forEach((s, idx) => {
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
    ...(roleName ? { roleName } : {}),
    description: request.description,
    prompt: request.prompt,
    communications: [...communications],
    sandboxPolicy: deps.sandboxPolicy,
    messages: collectMessages(),
    steps: [...steps.values()],
    usage: aggregateUsage(subAgent.state.messages),
    ...(filePath ? { filePath } : {}),
  })

  const startIndex = subAgent.state.messages.length

  // 子代理事件 → 快照桥接：内部步骤与 provenance 始终捕获，onSnapshot 存在时回传快照。
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
        deps.recordChildCall(request.toolCallId, {
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
        deps.recordChildCall(request.toolCallId, {
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
    onSnapshot?.(() => buildSubagentData(), progress)
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
        task: request.prompt,
      },
      signal,
    }),
  )

  let text = ""
  let error: string | undefined
  try {
    // 父 run 在 hook 派发期间中止：不启动新 turn（无活动 run 的 abort 是 no-op）。
    if (signal?.aborted) {
      return {
        subagentId,
        name: subagentName,
        ...(roleName ? { roleName } : {}),
        status: "aborted",
        text: "",
      }
    }
    const userMessage: AgentMessage = {
      role: "user",
      content: request.prompt,
      timestamp: Date.now(),
    }
    await subAgent.prompt(
      startHookMessages.length > 0 ? [...startHookMessages, userMessage] : userMessage,
    )

    const initialResult = extractSubagentResult(subAgent.state.messages, startIndex)
    text = initialResult.text
    error = initialResult.error

    // 空输出兜底：provider 偶发「正常结束但零输出」的空补全（usage.output = 0）时，
    // 丢弃空 assistant 消息并按原上下文续跑；重试仍在同一次 dispatch（同一 Protocol）内。
    for (
      let attempt = 0;
      attempt < SUBAGENT_EMPTY_OUTPUT_MAX_RETRIES && !text && !error && !signal?.aborted;
      attempt++
    ) {
      if (subAgent.state.messages.at(-1)?.role !== "assistant") break
      try {
        subAgent.state.removeLastMessage()
        await subAgent.continue()
      } catch (retryError) {
        console.warn(
          `Subagent empty-output retry failed: ${
            retryError instanceof Error ? retryError.message : String(retryError)
          }`,
        )
        break
      }
      const retriedResult = extractSubagentResult(subAgent.state.messages, startIndex)
      text = retriedResult.text
      error = retriedResult.error
    }
  } finally {
    unsubscribe()
    signal?.removeEventListener("abort", onAbort)
  }

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
  for (const hookMessage of stopHookMessages) {
    subAgent.state.appendMessage(hookMessage)
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

  const data = buildSubagentData()

  // 在会话池中登记/更新该子代理实例与历史快照数据（续接保留已固定角色）。
  deps.subagentPool?.set(subagentId, {
    subagentId,
    name: subagentName,
    agent: subAgent,
    data,
    createdAt: existing?.createdAt ?? Date.now(),
    lastActiveAt: Date.now(),
    ...(roleName ? { roleName } : {}),
  })

  // 最终输出有界化：超限写 spill（callId 叠加 subagentId，批量扇出时互不覆盖），快照同步记录落盘路径。
  const sessionId = deps.getSessionId?.() ?? undefined
  const bounded = text
    ? boundSubagentOutput(text, {
        sessionId,
        toolCallId: `${request.toolCallId}-${subagentId}`,
      })
    : undefined
  if (bounded?.filePath) data.filePath = bounded.filePath

  return {
    subagentId,
    name: subagentName,
    ...(roleName ? { roleName } : {}),
    status: subagentStatus,
    text: bounded?.content ?? "",
    ...(error ? { error } : {}),
    ...(bounded?.filePath ? { filePath: bounded.filePath } : {}),
    data,
  }
}
