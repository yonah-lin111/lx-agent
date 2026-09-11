import type {
  AgentMessage,
  AssistantMessage,
  ImageContent,
  TextContent,
  ThinkingContent,
  ToolCall,
  ToolResultMessage,
} from "@shared/contracts/agent"
import type { z } from "zod"
import type { AssistantMessageEventStream } from "./event-stream"

export type {
  AgentEvent,
  AgentMessage,
  AssistantMessage,
  AssistantMessageEvent,
  ImageContent,
  TextContent,
  ToolResultMessage,
  Usage,
} from "@shared/contracts/agent"

// 本地模型描述（由 modelFactory 从 settings 装配）。
export interface Model {
  provider: string
  id: string
  variant?: string
}

// 流式请求选项（streamFn 契约的一部分）。
export interface SimpleStreamOptions {
  apiKey?: string
  signal?: AbortSignal
  reasoning?: ThinkingLevel
  variant?: string
  sessionId?: string
  // 流式空闲超时毫秒数。
  idleTimeoutMs?: number
}

// 消息上下文（systemPrompt + LlmMessage + tools）。
export interface Context {
  systemPrompt: string
  messages: LlmMessage[]
  tools?: AgentTool<any>[]
}

/**
 * streamFn 契约：模型 + 上下文 → 助手消息事件流。
 * 约定：不得 throw；失败编码进事件流（error 事件 + stopReason: "error" | "aborted" 的最终消息）。
 */
export type StreamFn = (
  model: Model,
  context: Context,
  options?: SimpleStreamOptions,
) => AssistantMessageEventStream | Promise<AssistantMessageEventStream>

// 工具执行模式。
export type ToolExecutionMode = "sequential" | "parallel"

// 队列消费模式。
export type QueueMode = "all" | "one-at-a-time"

// 思考级别。
export type ThinkingLevel = "off" | "low" | "medium" | "high"

// 单个工具调用内容块。
export type AgentToolCall = Extract<AssistantMessage["content"][number], { type: "toolCall" }>

// beforeToolCall 返回结果：block 阻止执行；hookMessages 为随工具结果落位的审计消息。
export interface BeforeToolCallResult {
  block?: boolean
  reason?: string
  hookMessages?: AgentMessage[]
}

// 工具前后 hook 回调结果（PreToolUse 可阻断；PostToolUse 仅注入消息）。
export interface ToolHookResult {
  block?: { reason: string }
  messages?: AgentMessage[]
}

// afterToolCall 返回结果：字段级覆盖执行结果。
export interface AfterToolCallResult {
  content?: (TextContent | ImageContent)[]
  details?: unknown
  isError?: boolean
  terminate?: boolean
}

// beforeToolCall 上下文。
export interface BeforeToolCallContext {
  assistantMessage: AssistantMessage
  toolCall: AgentToolCall
  args: unknown
  context: AgentContext
}

// afterToolCall 上下文。
export interface AfterToolCallContext {
  assistantMessage: AssistantMessage
  toolCall: AgentToolCall
  args: unknown
  result: AgentToolResult<any>
  isError: boolean
  context: AgentContext
}

// shouldStopAfterTurn 上下文。
export interface ShouldStopAfterTurnContext {
  message: AssistantMessage
  toolResults: ToolResultMessage[]
  context: AgentContext
  newMessages: AgentMessage[]
}

// Agent 正常停止前（agent_end 前）的收尾上下文（Stop hook 注入点）。
export interface AgentStopContext {
  newMessages: AgentMessage[]
}

// prepareNextTurn 返回的替换运行时状态。
export interface AgentLoopTurnUpdate {
  context?: AgentContext
  model?: Model
  thinkingLevel?: ThinkingLevel
}

// prepareNextTurn 上下文。
export interface PrepareNextTurnContext extends ShouldStopAfterTurnContext {}

// Agent 低层循环配置。
export interface AgentLoopConfig extends SimpleStreamOptions {
  model: Model

  /** 每轮请求前将 AgentMessage[] 转换为 LLM 协议消息；不得 throw。 */
  convertToLlm: (messages: AgentMessage[]) => LlmMessage[] | Promise<LlmMessage[]>

  /** 上下文变换（AgentMessage 级）；不得 throw。 */
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>

  /** 动态解析 API key；不得 throw。 */
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined

  /** turn 完成后是否提前结束；不得 throw。 */
  shouldStopAfterTurn?: (context: ShouldStopAfterTurnContext) => boolean | Promise<boolean>

  /** turn 结束后、下一轮请求前替换上下文/模型/思考级别。 */
  prepareNextTurn?: (
    context: PrepareNextTurnContext,
  ) => AgentLoopTurnUpdate | undefined | Promise<AgentLoopTurnUpdate | undefined>

  /** 返回本轮需中途注入的消息（steer 语义）；不得 throw。 */
  getSteeringMessages?: () => Promise<AgentMessage[]>

  /** 返回模型将停止时注入的消息（followUp 语义）；不得 throw。 */
  getFollowUpMessages?: () => Promise<AgentMessage[]>

  /** Agent 正常停止前注入收尾消息（Stop hook）；不得 throw（失败按无输出处理）。 */
  onAgentStop?: (context: AgentStopContext) => Promise<AgentMessage[] | undefined>

  toolExecution?: ToolExecutionMode
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>
  /** 工具执行前（权限解析后）派发 PreToolUse；可阻断并注入消息。不得 throw。 */
  preToolUse?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<ToolHookResult | undefined>
  /** 工具执行收尾后派发 PostToolUse；仅注入消息。不得 throw。 */
  postToolUse?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<ToolHookResult | undefined>
}

// 工具执行结果。
export interface AgentToolResult<TDetails = unknown> {
  content: (TextContent | ImageContent)[]
  details?: TDetails
  terminate?: boolean
}

// 工具执行流式更新回调。
export type AgentToolUpdateCallback<TDetails = unknown> = (
  partialResult: AgentToolResult<TDetails>,
) => void

// Agent 工具定义（zod 版）。
export interface AgentTool<TParams extends z.ZodType = z.ZodType, TDetails = unknown> {
  name: string
  label: string
  description: string
  inputSchema: TParams
  prepareArguments?: (args: unknown) => unknown
  execute(
    toolCallId: string,
    params: z.infer<TParams>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ): Promise<AgentToolResult<TDetails>>
  executionMode?: ToolExecutionMode
}

// LLM 协议消息（convertToLlm 的输出，provider 无关的本地协议；适配器再映射为具体 provider 消息）。
export type LlmMessage =
  | { role: "user"; content: string | (TextContent | ImageContent)[] }
  | { role: "assistant"; content: (TextContent | ThinkingContent | ToolCall)[] }
  | {
      role: "toolResult"
      toolCallId: string
      toolName: string
      content: (TextContent | ImageContent)[]
      isError: boolean
    }

// Agent 上下文快照。
export interface AgentContext {
  systemPrompt: string
  messages: AgentMessage[]
  tools?: AgentTool<any>[]
}

// Agent 公开状态。
export interface AgentState {
  systemPrompt: string
  model: Model
  thinkingLevel: ThinkingLevel
  set tools(tools: AgentTool<any>[])
  get tools(): AgentTool<any>[]
  set messages(messages: AgentMessage[])
  get messages(): AgentMessage[]
  readonly isStreaming: boolean
  readonly streamingMessage?: AgentMessage
  readonly pendingToolCalls: ReadonlySet<string>
  readonly errorMessage?: string
}
