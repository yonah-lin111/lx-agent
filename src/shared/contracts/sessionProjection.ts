/**
 * 会话事件增量投影状态机 (SessionProjection)
 *
 * 架构参考：deepseek-harness (@deepseek-ai/dsh-client-runtime / session-projection)
 * 与 pi-main (SessionManager)
 *
 * 核心原则：
 * 1. 状态为不可变快照 (Immutable State Snapshot)。
 * 2. `projectSessionEvent(state, event)` 为纯函数状态转换 (Pure Reduction)。
 * 3. 任意时刻 `reduce(events, projectSessionEvent, initial)` 与实时增量投影严格等价。
 */

import type {
  AgentCapabilitySnapshot,
  AgentEvent,
  AgentMessage,
  JobSnapshot,
  PermissionRequest,
  QuestionRequest,
  TodoList,
} from "./agent"

/** 会话状态投影快照 */
export interface SessionProjectionState {
  sessionId: string | null
  title: string | null
  cwd: string | null
  messages: AgentMessage[]
  todos: TodoList
  activeCapabilities: AgentCapabilitySnapshot
  isStreaming: boolean
  isCompacting: boolean
  isCompactingManual: boolean
  queuedCount: number
  queuedMessages: string[]
  contextUsage: { tokens: number; contextWindow: number } | null
  activeJobs: Record<string, JobSnapshot>
  pendingPermission: PermissionRequest | null
  pendingQuestion: QuestionRequest | null
}

/** 创建初始状态快照 */
export function createInitialSessionProjectionState(
  partial?: Partial<SessionProjectionState>,
): SessionProjectionState {
  return {
    sessionId: null,
    title: null,
    cwd: null,
    messages: [],
    todos: [],
    activeCapabilities: { tools: [], mcp: [], skills: [] },
    isStreaming: false,
    isCompacting: false,
    isCompactingManual: false,
    queuedCount: 0,
    queuedMessages: [],
    contextUsage: null,
    activeJobs: {},
    pendingPermission: null,
    pendingQuestion: null,
    ...partial,
  }
}

/**
 * 纯函数：将单条 AgentEvent 应用于当前投影快照，派生下一个不可变快照
 */
export function projectSessionEvent(
  state: SessionProjectionState,
  event: AgentEvent,
): SessionProjectionState {
  switch (event.type) {
    case "agent_start": {
      return {
        ...state,
        isStreaming: true,
      }
    }

    case "agent_end": {
      return {
        ...state,
        isStreaming: false,
        pendingPermission: null,
        pendingQuestion: null,
        // 若事件携带最终消息快照，权威更新消息序列
        messages:
          event.messages && event.messages.length > 0 ? [...event.messages] : state.messages,
      }
    }

    case "turn_start": {
      return {
        ...state,
        isStreaming: true,
      }
    }

    case "turn_end": {
      return {
        ...state,
        pendingPermission: null,
        pendingQuestion: null,
      }
    }

    case "message_start": {
      return {
        ...state,
        messages: [...state.messages, event.message],
      }
    }

    case "message_update": {
      const messages = [...state.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = event.message
      } else {
        messages.push(event.message)
      }
      return {
        ...state,
        messages,
      }
    }

    case "message_end": {
      const messages = [...state.messages]
      if (messages.length > 0) {
        messages[messages.length - 1] = event.message
      } else {
        messages.push(event.message)
      }
      return {
        ...state,
        messages,
      }
    }

    case "tool_execution_start": {
      // 辅助更新当前流式中对应的 toolCall 块或状态
      return state
    }

    case "tool_execution_update": {
      return state
    }

    case "tool_execution_end": {
      return state
    }

    case "todo_updated": {
      return {
        ...state,
        todos: [...event.todos],
      }
    }

    case "session_title": {
      return {
        ...state,
        sessionId: event.sessionId,
        title: event.title,
      }
    }

    case "context_usage": {
      return {
        ...state,
        contextUsage: {
          tokens: event.tokens,
          contextWindow: event.contextWindow,
        },
      }
    }

    case "queue_changed": {
      return {
        ...state,
        queuedCount: event.length,
        queuedMessages: [...event.messages],
      }
    }

    case "compaction_start": {
      return {
        ...state,
        isCompacting: true,
        isCompactingManual: event.manual,
      }
    }

    case "compaction_failed": {
      return {
        ...state,
        isCompacting: false,
        isCompactingManual: false,
      }
    }

    case "compaction_summary": {
      return {
        ...state,
        isCompacting: false,
        isCompactingManual: false,
        messages: [...state.messages, event.message],
      }
    }

    case "model_switch": {
      return {
        ...state,
        messages: [...state.messages, event.message],
      }
    }

    case "job_started":
    case "job_settled": {
      return {
        ...state,
        activeJobs: {
          ...state.activeJobs,
          [event.job.id]: event.job,
        },
      }
    }

    case "job_output_chunk": {
      return state
    }

    case "permission_request": {
      return {
        ...state,
        pendingPermission: event.request,
      }
    }

    case "question_request": {
      return {
        ...state,
        pendingQuestion: event.request,
      }
    }

    case "mcp_status_changed": {
      return state
    }

    default: {
      return state
    }
  }
}

/**
 * 纯函数：将事件历史数组依次折叠投影为最终状态快照
 */
export function projectSessionHistory(
  initialState: SessionProjectionState,
  events: AgentEvent[],
): SessionProjectionState {
  return events.reduce(projectSessionEvent, initialState)
}

/**
 * 可观测会话投影状态机存储 (Observable Session Projection Store)
 */
export class SessionProjectionStore {
  private state: SessionProjectionState
  private readonly listeners = new Set<(state: SessionProjectionState) => void>()

  constructor(initialPartial?: Partial<SessionProjectionState>) {
    this.state = createInitialSessionProjectionState(initialPartial)
  }

  /** 获取当前不可变状态快照 */
  getState(): SessionProjectionState {
    return this.state
  }

  /** 应用事件并通知订阅者 */
  apply(event: AgentEvent): SessionProjectionState {
    const nextState = projectSessionEvent(this.state, event)
    if (nextState !== this.state) {
      this.state = nextState
      this.notify()
    }
    return this.state
  }

  /** 批量重放事件 */
  replay(events: AgentEvent[]): SessionProjectionState {
    const nextState = projectSessionHistory(this.state, events)
    if (nextState !== this.state) {
      this.state = nextState
      this.notify()
    }
    return this.state
  }

  /** 重置状态 */
  reset(partial?: Partial<SessionProjectionState>): void {
    this.state = createInitialSessionProjectionState(partial)
    this.notify()
  }

  /** 订阅状态变更 */
  subscribe(listener: (state: SessionProjectionState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}
