import type {
  AgentCapabilitySnapshot,
  AgentEvent,
  AgentMessage,
  ModelSwitchMessage,
  TodoList,
} from "@shared/contracts/agent"
import {
  type SessionProjectionState,
  SessionProjectionStore,
} from "@shared/contracts/sessionProjection"
import type { ModelSelection } from "@shared/settings"
import {
  type AgentCallKind,
  agentSessionService,
  createExternalId,
} from "@/services/agentSessionService"
import { gitSnapshotService, type SnapshotFileChange } from "@/services/gitSnapshotService"
import { isContextOverflowFailure } from "./compaction"
import { parseMemoryCitation } from "./memories/memoryManager"
import { detectModelFamily, getModelAdaptiveInstructions } from "./prompts/modelAdapters"
import type { ChildCallInput } from "./tools/task"
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "./tools/truncate"

// 会话归属上下文。
export interface SessionBinding {
  projectId?: string
  page?: string
}

// 附件文件（复制后写入 user message payloads 的 files 属性）。
export interface AttachedFile {
  name: string
  path: string
  type: "image" | "text"
  size?: string
  extension?: string
}

// 待落盘的调用记录（tool 事件缓冲）。
type PendingCall = {
  toolCallId: string
  // 落库 external_id：tool_execution_start 预生成，供子代理内部调用引用（parent_call_id）。
  externalId: string
  toolName: string
  args: string | null
  status: "running" | "success" | "error" | "aborted"
  result: string | null
  startedAt: number
  finishedAt: number | null
  // 子代理 provenance：触发本调用的父 task 调用行 external_id（普通调用为 null）。
  parentCallId: string | null
}

// 当前 turn 的落盘输入（beginTurn 时捕获，flushTurn 事务内消费）。
type PendingSessionInput = {
  binding: SessionBinding
  cwd: string
  title: string
  capabilities: AgentCapabilitySnapshot
  modelSelection?: ModelSelection
}

// beginTurn 输入（宿主注入会话归属、cwd 与能力快照与模型选择）。
export interface BeginTurnInput {
  text: string
  binding: SessionBinding
  cwd: string
  capabilities: AgentCapabilitySnapshot
  modelSelection?: ModelSelection
}

// 宿主状态访问接口（解耦 turn 持久化与 AgentRunner 状态）。
export interface TurnStoreDeps {
  // 落库会话 id 变化时同步宿主（权限/LSP 清理）。
  setSessionId: (sessionId: string | null) => void
  getCurrentSessionId: () => string | null
  // 新会话创建时同步宿主归属。
  setSessionBinding: (binding: SessionBinding) => void
  getCwd: () => string | undefined
  // 事件转发（todo_updated 等合成事件）。
  emit: (event: AgentEvent) => void
  // agent_end 收尾后推送上下文容量（委托 ContextCompactor）。
  emitUsage: () => void
}

// 由首条用户消息生成会话标题（空输入回退默认标题）。
const createTitle = (text: string): string => {
  const normalized = (text || "new chat").replace(/\s+/g, " ").trim().slice(0, 40)
  return normalized || "new chat"
}

// 调用视图落盘截断（复用 truncate.ts 常量）。
const truncateForStore = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  try {
    return truncateHead(JSON.stringify(value), {
      maxLines: DEFAULT_MAX_LINES,
      maxBytes: DEFAULT_MAX_BYTES,
    }).content
  } catch {
    return null
  }
}

// 判断是否 context-overflow 错误轮（不落库，自动压缩重试）。
export const isOverflowFailure = (message: AgentMessage): boolean =>
  message.role === "assistant" &&
  message.stopReason === "error" &&
  isContextOverflowFailure(message.errorMessage ?? "")

// turn 缓冲与持久化：缓冲 agent 事件、落库消息/调用/快照/任务清单，维护消息 → DB seq 对齐。
export class TurnStore {
  // 当前 turn 的落盘输入；beginTurn 时捕获，flushTurn 事务内消费。
  private sessionInput: PendingSessionInput | null = null
  // 本次 run 已提交的消息（message_end 事件缓冲）。
  private runMessages: AgentMessage[] = []
  // 本次 run 的工具调用缓冲。
  private pendingCalls = new Map<string, PendingCall>()
  // 子代理内部工具调用缓冲（provenance：parent_call_id 指向父 task 调用行；随父 turn 落库）。
  private pendingChildCalls = new Map<string, PendingCall>()
  // 任务清单：当前生效（transformContext 注入）；pendingTodo 为本轮待落库的整表快照。
  private todoList: TodoList = []
  private pendingTodo: TodoList | null = null
  // run 代数：负值表示当前无活动 run（已丢弃/已结束），残留事件不再落盘。
  private currentRunGeneration = -1
  // 消息 → DB seq 对齐（与 agent.state.messages 下标一一对应；未落库消息为 -1 恒保留）。
  private messageSeqs: number[] = []
  // 当前 turn 的起始快照哈希（beginTurn 后捕获；flushTurn 落库后清空）。
  private pendingSnapshotStart: string | null = null
  // 当前 turn 复制完成后的附件文件列表（写入 user message payloads 的 files 属性中）。
  private pendingCopiedFiles: AttachedFile[] | null = null
  // 本次 run 是否检测到 context-overflow 错误（不落库，force 压缩后自动重试一次）。
  private overflowDetected = false
  // MCP 工具全名 → server 名反查（flushTurn 落库 mcp_server/kind 分类用；随装配刷新）。
  private mcpServerByToolName = new Map<string, string>()
  // 增量事件投影状态机（可观测、确定性内存真相源）。
  private readonly projection = new SessionProjectionStore()

  constructor(private readonly deps: TurnStoreDeps) {}

  // 获取当前会话状态投影快照。
  getProjection(): SessionProjectionState {
    return this.projection.getState()
  }

  // 订阅投影状态变更。
  subscribeProjection(listener: (state: SessionProjectionState) => void): () => void {
    return this.projection.subscribe(listener)
  }

  // run 开始：重置缓冲并捕获本次落盘输入。
  beginTurn(input: BeginTurnInput): void {
    this.currentRunGeneration += 1
    this.runMessages = []
    this.pendingCalls.clear()
    this.pendingChildCalls.clear()
    this.sessionInput = {
      binding: input.binding,
      cwd: input.cwd,
      title: createTitle(input.text),
      capabilities: input.capabilities,
      modelSelection: input.modelSelection,
    }
  }

  // 丢弃未落盘的 turn（恢复/新建/失败时调用；残留事件不再落盘）。
  discardTurn(): void {
    this.sessionInput = null
    this.runMessages = []
    this.pendingCalls.clear()
    this.pendingChildCalls.clear()
    this.currentRunGeneration = -1
    this.pendingSnapshotStart = null
  }

  // 当前 turn 落盘输入（新建会话建行判断用）。
  getSessionInput(): PendingSessionInput | null {
    return this.sessionInput
  }

  // 运行时更新任务清单（todowrite 整表替换；pendingTodo 随本轮落库）。
  setTodo(todos: TodoList): void {
    this.todoList = todos
    this.pendingTodo = todos
  }

  // 恢复/回退任务清单（仅内存生效，不触发本轮落库）。
  loadTodo(todos: TodoList): void {
    this.todoList = todos
  }

  // 清空任务清单（会话新建/整体删除）。
  clearTodo(): void {
    this.todoList = []
    this.pendingTodo = null
  }

  getTodo(): TodoList {
    return this.todoList
  }

  // 消息 → DB seq 对齐（与 agent.state.messages 下标一一对应）。
  getMessageSeqs(): number[] {
    return this.messageSeqs
  }

  setMessageSeqs(seqs: number[]): void {
    this.messageSeqs = seqs
  }

  // 清空 seq 对齐（新会话从空上下文开始）。
  resetSeqs(): void {
    this.messageSeqs = []
  }

  // 按 DB 消息 timestamp 重建 seq 对齐（restoreMessages 用；未命中 = 幽灵消息，恒保留 -1）。
  syncMessageSeqs(messages: AgentMessage[]): number[] {
    const seqByTimestamp = new Map<number, number>()
    const sessionId = this.deps.getCurrentSessionId()
    if (sessionId) {
      for (const entry of agentSessionService.listEntries(sessionId)) {
        if (entry.type !== "message" && entry.type !== "model_change") continue
        try {
          const message = JSON.parse(entry.payload) as AgentMessage
          if (typeof message.timestamp === "number" && !seqByTimestamp.has(message.timestamp)) {
            seqByTimestamp.set(message.timestamp, entry.seq)
          }
        } catch {
          // 损坏 entry 跳过。
        }
      }
    }
    this.messageSeqs = messages.map((message) =>
      typeof message.timestamp === "number" ? (seqByTimestamp.get(message.timestamp) ?? -1) : -1,
    )
    return this.messageSeqs
  }

  // 消费并清空 overflow 检测标记（send 自动压缩重试判定）。
  consumeOverflow(): boolean {
    const detected = this.overflowDetected
    this.overflowDetected = false
    return detected
  }

  resetOverflow(): void {
    this.overflowDetected = false
  }

  setCopiedFiles(files: AttachedFile[]): void {
    this.pendingCopiedFiles = files
  }

  clearCopiedFiles(): void {
    this.pendingCopiedFiles = null
  }

  // MCP 工具全名 → server 名反查（flushTurn 落库 mcp_server/kind 分类用；随装配刷新）。
  setMcpToolNames(map: Map<string, string>): void {
    this.mcpServerByToolName = map
  }

  // turn 起始快照：cwd 是 git 仓库才记录 tree hash，否则 null（静默降级）。
  captureSnapshot(): string | null {
    const cwd = this.deps.getCwd()
    if (!cwd) return null
    this.pendingSnapshotStart = gitSnapshotService.capture(cwd)
    return this.pendingSnapshotStart
  }

  // 计算本轮快照记录：hash_end + 变更列表；无变更/非 git 返回 null（并清理起始哈希）。
  computeSnapshotRecord(messages: AgentMessage[]): {
    userMessageTimestamp: number
    hashStart: string
    hashEnd: string
    changes: SnapshotFileChange[]
  } | null {
    const hashStart = this.pendingSnapshotStart
    this.pendingSnapshotStart = null
    const cwd = this.deps.getCwd()
    if (!hashStart || !cwd) return null
    const hashEnd = gitSnapshotService.capture(cwd)
    if (!hashEnd || hashEnd === hashStart) return null
    const changes = gitSnapshotService.diff(hashStart, hashEnd, cwd)
    const userTimestamp = messages.find((message) => message.role === "user")?.timestamp
    if (changes.length === 0 || userTimestamp === undefined) return null
    return { userMessageTimestamp: userTimestamp, hashStart, hashEnd, changes }
  }

  // 回滚一轮的文件改动（仅当被删轮是最后一条用户消息轮；git 仓库才生效）。
  revertTurnFiles(sessionId: string, userMessageTimestamp: number): void {
    const session = agentSessionService.getSession(sessionId)
    if (!session) return
    const snapshot = agentSessionService.getSnapshotByUserTimestamp(sessionId, userMessageTimestamp)
    if (!snapshot) return
    try {
      const changes = JSON.parse(snapshot.files_changed) as SnapshotFileChange[]
      gitSnapshotService.revert(session.cwd, snapshot.hash_start, changes)
    } catch {
      // 快照损坏回滚失败：静默，仅删消息（尽力而为）。
    }
  }

  // Agent 事件 → 持久化缓冲与增量状态投影。
  handleEvent(event: AgentEvent): void {
    this.projection.apply(event)
    if (this.currentRunGeneration < 0) return
    switch (event.type) {
      case "message_start":
        if (event.message.role === "user" && this.pendingCopiedFiles) {
          event.message.files = this.pendingCopiedFiles
        }
        break

      case "message_end":
        // context-overflow 错误轮不落库：标记后由 send 自动压缩重试，避免污染真相源。
        if (isOverflowFailure(event.message)) {
          this.overflowDetected = true
        } else {
          if (event.message.role === "user" && this.pendingCopiedFiles) {
            event.message.files = this.pendingCopiedFiles
          }
          // Assistant 消息：提取 <oai-mem-citation> 引用块并挂载 citations 属性
          if (event.message.role === "assistant") {
            for (const part of event.message.content) {
              if (part.type === "text") {
                const { citation, cleanText } = parseMemoryCitation(part.text)
                if (citation) {
                  event.message.citations = citation
                  part.text = cleanText
                }
              }
            }
          }
          this.runMessages.push(event.message)
        }
        break

      case "tool_execution_start":
        this.pendingCalls.set(event.toolCallId, {
          toolCallId: event.toolCallId,
          // 预生成落库 id：子代理内部调用以它为 parent_call_id（父 task 调用行 id 提前可知）。
          externalId: createExternalId(),
          toolName: event.toolName,
          args: truncateForStore(event.args),
          status: "running",
          result: null,
          startedAt: Date.now(),
          finishedAt: null,
          parentCallId: null,
        })
        break

      case "tool_execution_end": {
        const call = this.pendingCalls.get(event.toolCallId)
        if (call) {
          call.status = event.isError ? "error" : "success"
          call.result = truncateForStore(event.result)
          call.finishedAt = Date.now()
        }
        // todowrite：解析整表清单 → 更新内存 + 推送事件（清单由 flushTurn 同事务落 todo entry）。
        if (event.toolName === "todowrite" && !event.isError) {
          const details = (event.result as { details?: { todos?: TodoList } }).details
          const todos = details?.todos
          if (Array.isArray(todos)) {
            this.setTodo(todos)
            this.deps.emit({ type: "todo_updated", todos })
          }
        }
        break
      }

      case "agent_end":
        this.flushTurn()
        // turn 结束（正常/错误/中止均触发）：上下文定型后推送容量快照。
        this.deps.emitUsage()
        break
    }
  }

  // agent_call kind 分类：mcp（工具名 ∈ MCP 全名）/ subagent（task）/ skill（read_skill）/ builtin。
  classifyCall(toolName: string): AgentCallKind {
    if (toolName === "task") return "subagent"
    if (toolName === "read_skill") return "skill"
    if (this.mcpServerByToolName.has(toolName)) return "mcp"
    return "builtin"
  }

  // 记录子代理内部工具调用（provenance）：parent_call_id 指向触发它的父 task 调用行；
  // 与父 turn 同事务落库（entry_id 恒 null；UI 不展示，供查询/审计）。
  recordChildCall(parentToolCallId: string, child: ChildCallInput): void {
    const parent = this.pendingCalls.get(parentToolCallId)
    if (!parent) return // 父调用未在缓冲（如 turn 已丢弃）：忽略，不落孤儿行。
    const existing = this.pendingChildCalls.get(child.toolCallId)
    this.pendingChildCalls.set(child.toolCallId, {
      toolCallId: child.toolCallId,
      // start 已预生成 id；end 更新复用（同一次调用一条记录）。
      externalId: existing?.externalId ?? createExternalId(),
      toolName: child.toolName,
      args: truncateForStore(child.args),
      status: child.status,
      result: truncateForStore(child.result),
      // 保留 start 时刻的真实起始时间（end 事件不覆盖）。
      startedAt: existing?.startedAt ?? child.startedAt,
      finishedAt: child.finishedAt,
      parentCallId: parent.externalId,
    })
  }

  // 会话不存在时创建会话行 + 能力快照；已存在则直接返回（须在事务内调用）。
  createSessionIfNeeded(
    input: PendingSessionInput,
    now: string,
  ): { sessionId: string; initialModelMessage?: ModelSwitchMessage } {
    let sessionId = this.deps.getCurrentSessionId()
    let initialModelMessage: ModelSwitchMessage | undefined
    if (!sessionId) {
      sessionId = createExternalId()
      agentSessionService.insertSession({
        externalId: sessionId,
        projectId: input.binding.projectId ?? null,
        page: input.binding.page ?? null,
        title: input.title,
        cwd: input.cwd,
        createdAt: now,
        updatedAt: now,
      })
      let seq = agentSessionService.nextSeq(sessionId)
      agentSessionService.insertEntry({
        externalId: createExternalId(),
        sessionId,
        seq: seq++,
        type: "active_capabilities",
        payload: JSON.stringify(input.capabilities),
        createdAt: now,
      })
      if (input.modelSelection) {
        const family = detectModelFamily(input.modelSelection.model)
        const instructions = getModelAdaptiveInstructions(family)
        initialModelMessage = {
          role: "modelSwitch",
          provider: input.modelSelection.provider,
          model: input.modelSelection.model,
          family,
          instructions,
          timestamp: Date.now(),
          isInitial: true,
        }
        agentSessionService.insertEntry({
          externalId: createExternalId(),
          sessionId,
          seq: seq++,
          type: "model_change",
          payload: JSON.stringify(initialModelMessage),
          createdAt: now,
        })
        this.messageSeqs.push(seq - 1)
      }
      this.deps.setSessionId(sessionId)
      this.deps.setSessionBinding(input.binding)
      this.projection.apply({ type: "session_title", sessionId, title: input.title })
    }
    return { sessionId, initialModelMessage }
  }

  // 会话是否已落库消息（首轮 prompt 失败清理空会话判定）。
  hasSessionMessages(sessionId: string): boolean {
    return agentSessionService.listMessageEntries(sessionId).length > 0
  }

  // 一个 turn 落库：会话创建（含能力/模型快照）+ 消息 entries + 调用记录 + todo 清单，一个事务。
  flushTurn(): void {
    const input = this.sessionInput
    const messages = this.runMessages
    const calls = [...this.pendingCalls.values()]
    const childCalls = [...this.pendingChildCalls.values()]
    const pendingTodo = this.pendingTodo
    this.sessionInput = null
    this.runMessages = []
    this.pendingCalls.clear()
    this.pendingChildCalls.clear()
    this.pendingTodo = null
    this.currentRunGeneration = -1

    if (!input || messages.length === 0) {
      this.pendingSnapshotStart = null
      return
    }

    const now = new Date().toISOString()
    const entries = messages.map((message) => ({
      externalId: createExternalId(),
      type: "message",
      payload: JSON.stringify(message),
    }))
    // 工具调用 → 触发它的 assistant message entry（双向互跳）。
    const entryIdByToolCallId = new Map<string, string>()
    messages.forEach((message, index) => {
      if (message.role !== "assistant") return
      for (const block of message.content) {
        if (block.type === "toolCall") {
          entryIdByToolCallId.set(block.id, entries[index]!.externalId)
        }
      }
    })

    // 文件快照：git 操作（add/write-tree/diff）放事务外，避免阻塞 DB 事务。
    const snapshotRecord = this.computeSnapshotRecord(messages)

    agentSessionService.transaction(() => {
      const { sessionId } = this.createSessionIfNeeded(input, now)

      let seq = agentSessionService.nextSeq(sessionId)
      const appendedSeqs: number[] = []
      for (const entry of entries) {
        agentSessionService.insertEntry({
          externalId: entry.externalId,
          sessionId,
          seq,
          type: entry.type,
          payload: entry.payload,
          createdAt: now,
        })
        appendedSeqs.push(seq)
        seq += 1
      }

      for (const call of calls) {
        const finishedAt = call.finishedAt
        agentSessionService.insertCall({
          sessionId,
          externalId: call.externalId,
          entryId: entryIdByToolCallId.get(call.toolCallId) ?? null,
          parentCallId: call.parentCallId,
          // kind 分类：mcp（工具名 ∈ MCP 全名）/ subagent（task）/ skill（read_skill）/ builtin。
          kind: this.classifyCall(call.toolName),
          name: call.toolName,
          mcpServer: this.mcpServerByToolName.get(call.toolName) ?? null,
          status: call.status,
          args: call.args,
          result: call.result,
          durationMs: finishedAt !== null ? finishedAt - call.startedAt : null,
          startedAt: new Date(call.startedAt).toISOString(),
          finishedAt: finishedAt !== null ? new Date(finishedAt).toISOString() : null,
          createdAt: now,
          updatedAt: now,
        })
      }

      // 子代理内部调用：entry_id 恒 null（非 turn 消息产物），parent_call_id 指触发它的父 task 调用行。
      for (const child of childCalls) {
        const finishedAt = child.finishedAt
        agentSessionService.insertCall({
          sessionId,
          externalId: child.externalId,
          entryId: null,
          parentCallId: child.parentCallId,
          kind: this.classifyCall(child.toolName),
          name: child.toolName,
          mcpServer: this.mcpServerByToolName.get(child.toolName) ?? null,
          status: child.status,
          args: child.args,
          result: child.result,
          durationMs: finishedAt !== null ? finishedAt - child.startedAt : null,
          startedAt: new Date(child.startedAt).toISOString(),
          finishedAt: finishedAt !== null ? new Date(finishedAt).toISOString() : null,
          createdAt: now,
          updatedAt: now,
        })
      }

      // todo 清单（本轮整表替换）：追加型 entry，payload = JSON(TodoList)；恢复/回退读最后一条。
      if (pendingTodo) {
        agentSessionService.insertEntry({
          externalId: createExternalId(),
          sessionId,
          seq,
          type: "todo",
          payload: JSON.stringify(pendingTodo),
          createdAt: now,
        })
        seq += 1
      }

      agentSessionService.touchSession(sessionId, now)
      // 本轮消息 seq 追加到对齐数组（与 agent.state.messages 尾部对应）。
      this.messageSeqs.push(...appendedSeqs)
      // 本轮文件快照（hash_start → hash_end + 变更列表）。
      if (snapshotRecord) {
        agentSessionService.insertSnapshot({
          externalId: createExternalId(),
          sessionId,
          userMessageTimestamp: snapshotRecord.userMessageTimestamp,
          hashStart: snapshotRecord.hashStart,
          hashEnd: snapshotRecord.hashEnd,
          filesChanged: JSON.stringify(snapshotRecord.changes),
          createdAt: now,
        })
      }
    })
  }

  // 按 seq 读取会话，重建消息列表、消息 → seq 对齐、最近的能力快照与任务清单。
  readSessionEntries(sessionId: string): {
    messages: AgentMessage[]
    seqs: number[]
    capabilities: AgentCapabilitySnapshot
    todos: TodoList
  } {
    const messages: AgentMessage[] = []
    const seqs: number[] = []
    let capabilities: AgentCapabilitySnapshot = { tools: [], mcp: [], skills: [] }
    // 最后一条 todo entry（整表替换语义；后写覆盖前写）。
    let todos: TodoList = []

    for (const entry of agentSessionService.listEntries(sessionId)) {
      if (entry.type === "message" || entry.type === "model_change") {
        try {
          messages.push(JSON.parse(entry.payload) as AgentMessage)
          seqs.push(entry.seq)
        } catch {
          // 损坏的 message / model_change entry 跳过，不阻断恢复。
        }
      } else if (entry.type === "active_capabilities") {
        const parsed = JSON.parse(entry.payload) as Partial<AgentCapabilitySnapshot>
        capabilities = {
          tools: Array.isArray(parsed.tools) ? parsed.tools : [],
          mcp: Array.isArray(parsed.mcp) ? parsed.mcp : [],
          skills: Array.isArray(parsed.skills) ? parsed.skills : [],
        }
      } else if (entry.type === "todo") {
        try {
          const parsed = JSON.parse(entry.payload) as unknown
          if (Array.isArray(parsed)) todos = parsed as TodoList
        } catch {
          // 损坏的 todo entry 跳过，保留前一条。
        }
      }
    }
    this.projection.reset({
      sessionId,
      messages: [...messages],
      todos: [...todos],
      activeCapabilities: capabilities,
    })
    return { messages, seqs, capabilities, todos }
  }

  // 读取会话最后一条 todo entry（整表替换语义：后写覆盖前写；无则空清单）。
  readLastTodoEntry(sessionId: string): TodoList {
    const entries = agentSessionService.listEntries(sessionId)
    for (let index = entries.length - 1; index >= 0; index--) {
      if (entries[index].type !== "todo") continue
      try {
        const parsed = JSON.parse(entries[index].payload) as unknown
        if (Array.isArray(parsed)) return parsed as TodoList
      } catch {
        // 损坏 entry 继续往前找。
      }
    }
    return []
  }
}
