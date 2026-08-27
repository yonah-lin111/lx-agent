import type {
  AgentMessage,
  AssistantMessage,
  ImageContent,
  TextContent,
  Usage,
} from "@shared/contracts/agent"
import { runAgentLoop, runAgentLoopContinue } from "./agent-loop"
import { getDefaultStreamFn } from "./stream-fn"
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentLoopTurnUpdate,
  AgentState,
  AgentTool,
  BeforeToolCallContext,
  BeforeToolCallResult,
  LlmMessage,
  Model,
  PrepareNextTurnContext,
  QueueMode,
  StreamFn,
  ToolExecutionMode,
} from "./types"

export type { QueueMode } from "./types"

// 默认消息转换：仅透传标准 LLM 角色消息。
// 压缩摘要消息（compactionSummary）与任务清单消息（todoState）在 LLM 协议层映射为
// 带标记的 user 文本（协议无此角色，单独转换不混淆；UI 侧分别走专属块/dock 展示）。
function defaultConvertToLlm(messages: AgentMessage[]): LlmMessage[] {
  return messages.flatMap((message): LlmMessage[] => {
    if (message.role === "compactionSummary") {
      return [
        {
          role: "user",
          content: `[上下文压缩摘要]\n${message.summary}`,
        },
      ]
    }
    if (message.role === "todoState") {
      const lines = message.todos.map(
        (todo, index) => `#${index + 1} [${todo.status}] ${todo.content}`,
      )
      return [
        {
          role: "user",
          content: `[任务清单]\n${lines.join("\n")}`,
        },
      ]
    }
    if (message.role === "modelSwitch") {
      return []
    }
    if (message.role === "user" || message.role === "assistant" || message.role === "toolResult") {
      return [message]
    }
    return []
  })
}

const EMPTY_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  totalTokens: 0,
}

const DEFAULT_MODEL: Model = {
  provider: "unknown",
  id: "unknown",
}

type MutableAgentState = Omit<
  AgentState,
  "isStreaming" | "streamingMessage" | "pendingToolCalls" | "errorMessage"
> & {
  isStreaming: boolean
  streamingMessage?: AgentMessage
  pendingToolCalls: Set<string>
  errorMessage?: string
}

function createMutableAgentState(
  initialState?: Partial<
    Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">
  >,
): MutableAgentState {
  let tools = initialState?.tools?.slice() ?? []
  let messages = initialState?.messages?.slice() ?? []

  return {
    systemPrompt: initialState?.systemPrompt ?? "",
    model: initialState?.model ?? DEFAULT_MODEL,
    thinkingLevel: initialState?.thinkingLevel ?? "off",
    get tools() {
      return tools
    },
    set tools(nextTools: AgentTool<any>[]) {
      tools = nextTools.slice()
    },
    get messages() {
      return messages
    },
    set messages(nextMessages: AgentMessage[]) {
      messages = nextMessages.slice()
    },
    isStreaming: false,
    streamingMessage: undefined,
    pendingToolCalls: new Set<string>(),
    errorMessage: undefined,
  }
}

// Agent 构造选项。
export interface AgentOptions {
  initialState?: Partial<
    Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">
  >
  convertToLlm?: (messages: AgentMessage[]) => LlmMessage[] | Promise<LlmMessage[]>
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>
  streamFn: StreamFn
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>
  prepareNextTurn?: (
    signal?: AbortSignal,
  ) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined
  prepareNextTurnWithContext?: (
    context: PrepareNextTurnContext,
    signal?: AbortSignal,
  ) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined
  steeringMode?: QueueMode
  followUpMode?: QueueMode
  toolExecution?: ToolExecutionMode
}

// 待处理消息队列。
class PendingMessageQueue {
  private messages: AgentMessage[] = []
  public mode: QueueMode

  constructor(mode: QueueMode) {
    this.mode = mode
  }

  enqueue(message: AgentMessage): void {
    this.messages.push(message)
  }

  hasItems(): boolean {
    return this.messages.length > 0
  }

  drain(): AgentMessage[] {
    if (this.mode === "all") {
      const drained = this.messages.slice()
      this.messages = []
      return drained
    }

    const first = this.messages[0]
    if (!first) {
      return []
    }
    this.messages = this.messages.slice(1)
    return [first]
  }

  clear(): void {
    this.messages = []
  }
}

type ActiveRun = {
  promise: Promise<void>
  resolve: () => void
  abortController: AbortController
}

/**
 * 围绕低层 agent 循环的有状态封装。
 *
 * 持有当前会话上下文，发出生命周期事件，执行工具，暴露 steer/followUp 队列 API。
 */
export class Agent {
  private _state: MutableAgentState
  private readonly listeners = new Set<
    (event: AgentEvent, signal: AbortSignal) => Promise<void> | void
  >()
  private readonly steeringQueue: PendingMessageQueue
  private readonly followUpQueue: PendingMessageQueue

  public convertToLlm: (messages: AgentMessage[]) => LlmMessage[] | Promise<LlmMessage[]>
  public transformContext?: (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]>
  public streamFunction: StreamFn
  public getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined
  public beforeToolCall?: (
    context: BeforeToolCallContext,
    signal?: AbortSignal,
  ) => Promise<BeforeToolCallResult | undefined>
  public afterToolCall?: (
    context: AfterToolCallContext,
    signal?: AbortSignal,
  ) => Promise<AfterToolCallResult | undefined>
  public prepareNextTurn?: (
    signal?: AbortSignal,
  ) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined
  public prepareNextTurnWithContext?: (
    context: PrepareNextTurnContext,
    signal?: AbortSignal,
  ) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined
  private activeRun?: ActiveRun
  public toolExecution: ToolExecutionMode

  constructor(options: AgentOptions) {
    const runtimeOptions: Partial<AgentOptions> = options ?? {}
    this._state = createMutableAgentState(runtimeOptions.initialState)
    this.convertToLlm = runtimeOptions.convertToLlm ?? defaultConvertToLlm
    this.transformContext = runtimeOptions.transformContext
    this.streamFunction = runtimeOptions.streamFn ?? getDefaultStreamFn()
    this.getApiKey = runtimeOptions.getApiKey
    this.beforeToolCall = runtimeOptions.beforeToolCall
    this.afterToolCall = runtimeOptions.afterToolCall
    this.prepareNextTurn = runtimeOptions.prepareNextTurn
    this.prepareNextTurnWithContext = runtimeOptions.prepareNextTurnWithContext
    this.steeringQueue = new PendingMessageQueue(runtimeOptions.steeringMode ?? "one-at-a-time")
    this.followUpQueue = new PendingMessageQueue(runtimeOptions.followUpMode ?? "one-at-a-time")
    this.toolExecution = runtimeOptions.toolExecution ?? "parallel"
  }

  /**
   * 订阅 Agent 生命周期事件。监听器按订阅顺序 await，参与当前 run 的收尾。
   */
  subscribe(
    listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void,
  ): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 当前 Agent 状态。 */
  get state(): AgentState {
    return this._state
  }

  /** steer 队列消费模式。 */
  set steeringMode(mode: QueueMode) {
    this.steeringQueue.mode = mode
  }

  get steeringMode(): QueueMode {
    return this.steeringQueue.mode
  }

  /** followUp 队列消费模式。 */
  set followUpMode(mode: QueueMode) {
    this.followUpQueue.mode = mode
  }

  get followUpMode(): QueueMode {
    return this.followUpQueue.mode
  }

  /** 排队一条消息，在当前助手 turn 结束后注入。 */
  steer(message: AgentMessage): void {
    this.steeringQueue.enqueue(message)
  }

  /** 排队一条消息，仅在 Agent 将停止时注入。 */
  followUp(message: AgentMessage): void {
    this.followUpQueue.enqueue(message)
  }

  /** 清空 steer 队列。 */
  clearSteeringQueue(): void {
    this.steeringQueue.clear()
  }

  /** 清空 followUp 队列。 */
  clearFollowUpQueue(): void {
    this.followUpQueue.clear()
  }

  /** 清空所有队列。 */
  clearAllQueues(): void {
    this.clearSteeringQueue()
    this.clearFollowUpQueue()
  }

  /** 任一队列仍有待处理消息时返回 true。 */
  hasQueuedMessages(): boolean {
    return this.steeringQueue.hasItems() || this.followUpQueue.hasItems()
  }

  /** 当前 run 的 abort signal（无活动 run 时为 undefined）。 */
  get signal(): AbortSignal | undefined {
    return this.activeRun?.abortController.signal
  }

  /** 中止当前 run（若存在）。 */
  abort(): void {
    this.activeRun?.abortController.abort()
  }

  /** 等待当前 run 与所有事件监听器收尾。 */
  waitForIdle(): Promise<void> {
    return this.activeRun?.promise ?? Promise.resolve()
  }

  /** 清空会话上下文、运行时状态与队列。 */
  reset(): void {
    this._state.messages = []
    this._state.isStreaming = false
    this._state.streamingMessage = undefined
    this._state.pendingToolCalls = new Set<string>()
    this._state.errorMessage = undefined
    this.clearFollowUpQueue()
    this.clearSteeringQueue()
  }

  /** 从文本、单条消息或消息批启动新 prompt。 */
  async prompt(message: AgentMessage | AgentMessage[]): Promise<void>
  async prompt(input: string, images?: ImageContent[]): Promise<void>
  async prompt(
    input: string | AgentMessage | AgentMessage[],
    images?: ImageContent[],
  ): Promise<void> {
    if (this.activeRun) {
      throw new Error(
        "Agent is already processing a prompt. Use steer() or followUp() to queue messages, or wait for completion.",
      )
    }
    const messages = this.normalizePromptInput(input, images)
    await this.runPromptMessages(messages)
  }

  /** 从当前会话上下文继续（最后一条消息须为 user 或 toolResult）。 */
  async continue(): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing. Wait for completion before continuing.")
    }

    const lastMessage = this._state.messages[this._state.messages.length - 1]
    if (!lastMessage) {
      throw new Error("No messages to continue from")
    }

    if (lastMessage.role === "assistant") {
      const queuedSteering = this.steeringQueue.drain()
      if (queuedSteering.length > 0) {
        await this.runPromptMessages(queuedSteering, { skipInitialSteeringPoll: true })
        return
      }

      const queuedFollowUps = this.followUpQueue.drain()
      if (queuedFollowUps.length > 0) {
        await this.runPromptMessages(queuedFollowUps)
        return
      }

      throw new Error("Cannot continue from message role: assistant")
    }

    await this.runContinuation()
  }

  private normalizePromptInput(
    input: string | AgentMessage | AgentMessage[],
    images?: ImageContent[],
  ): AgentMessage[] {
    if (Array.isArray(input)) {
      return input
    }

    if (typeof input !== "string") {
      return [input]
    }

    const content: Array<TextContent | ImageContent> = [{ type: "text", text: input }]
    if (images && images.length > 0) {
      content.push(...images)
    }
    return [{ role: "user", content, timestamp: Date.now() }]
  }

  private async runPromptMessages(
    messages: AgentMessage[],
    options: { skipInitialSteeringPoll?: boolean } = {},
  ): Promise<void> {
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoop(
        messages,
        this.createContextSnapshot(),
        this.createLoopConfig(options),
        (event) => this.processEvents(event),
        signal,
        this.streamFunction,
      )
    })
  }

  private async runContinuation(): Promise<void> {
    await this.runWithLifecycle(async (signal) => {
      await runAgentLoopContinue(
        this.createContextSnapshot(),
        this.createLoopConfig(),
        (event) => this.processEvents(event),
        signal,
        this.streamFunction,
      )
    })
  }

  private createContextSnapshot(): AgentContext {
    return {
      systemPrompt: this._state.systemPrompt,
      messages: this._state.messages.slice(),
      tools: this._state.tools.slice(),
    }
  }

  private createLoopConfig(options: { skipInitialSteeringPoll?: boolean } = {}): AgentLoopConfig {
    let skipInitialSteeringPoll = options.skipInitialSteeringPoll === true
    return {
      model: this._state.model,
      reasoning: this._state.thinkingLevel === "off" ? undefined : this._state.thinkingLevel,
      toolExecution: this.toolExecution,
      beforeToolCall: this.beforeToolCall,
      afterToolCall: this.afterToolCall,
      prepareNextTurn:
        this.prepareNextTurnWithContext || this.prepareNextTurn
          ? async (context) => {
              if (this.prepareNextTurnWithContext) {
                return await this.prepareNextTurnWithContext(context, this.signal)
              }
              return await this.prepareNextTurn?.(this.signal)
            }
          : undefined,
      convertToLlm: this.convertToLlm,
      transformContext: this.transformContext,
      getApiKey: this.getApiKey,
      getSteeringMessages: async () => {
        if (skipInitialSteeringPoll) {
          skipInitialSteeringPoll = false
          return []
        }
        return this.steeringQueue.drain()
      },
      getFollowUpMessages: async () => this.followUpQueue.drain(),
    }
  }

  private async runWithLifecycle(executor: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.activeRun) {
      throw new Error("Agent is already processing.")
    }

    const abortController = new AbortController()
    let resolvePromise = () => {}
    const promise = new Promise<void>((resolve) => {
      resolvePromise = resolve
    })
    this.activeRun = { promise, resolve: resolvePromise, abortController }

    this._state.isStreaming = true
    this._state.streamingMessage = undefined
    this._state.errorMessage = undefined

    try {
      await executor(abortController.signal)
    } catch (error) {
      await this.handleRunFailure(error, abortController.signal.aborted)
    } finally {
      this.finishRun()
    }
  }

  // 运行失败时合成错误助手消息并发出收尾事件。
  private async handleRunFailure(error: unknown, aborted: boolean): Promise<void> {
    const failureMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: "" }],
      provider: this._state.model.provider,
      model: this._state.model.id,
      usage: EMPTY_USAGE,
      stopReason: aborted ? "aborted" : "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
    }
    await this.processEvents({ type: "message_start", message: failureMessage })
    await this.processEvents({ type: "message_end", message: failureMessage })
    await this.processEvents({ type: "turn_end", message: failureMessage, toolResults: [] })
    await this.processEvents({ type: "agent_end", messages: [failureMessage] })
  }

  private finishRun(): void {
    this._state.isStreaming = false
    this._state.streamingMessage = undefined
    this._state.pendingToolCalls = new Set<string>()
    this.activeRun?.resolve()
    this.activeRun = undefined
  }

  /**
   * 将循环事件归约为内部状态，再 await 监听器。
   */
  private async processEvents(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "message_start":
        this._state.streamingMessage = event.message
        break

      case "message_update":
        this._state.streamingMessage = event.message
        break

      case "message_end":
        this._state.streamingMessage = undefined
        this._state.messages.push(event.message)
        break

      case "tool_execution_start": {
        const pendingToolCalls = new Set(this._state.pendingToolCalls)
        pendingToolCalls.add(event.toolCallId)
        this._state.pendingToolCalls = pendingToolCalls
        break
      }

      case "tool_execution_end": {
        const pendingToolCalls = new Set(this._state.pendingToolCalls)
        pendingToolCalls.delete(event.toolCallId)
        this._state.pendingToolCalls = pendingToolCalls
        break
      }

      case "turn_end":
        if (event.message.role === "assistant" && event.message.errorMessage) {
          this._state.errorMessage = event.message.errorMessage
        }
        break

      case "agent_end":
        this._state.streamingMessage = undefined
        break
    }

    const signal = this.activeRun?.abortController.signal
    if (!signal) {
      throw new Error("Agent listener invoked outside active run")
    }
    for (const listener of this.listeners) {
      await listener(event, signal)
    }
  }
}
