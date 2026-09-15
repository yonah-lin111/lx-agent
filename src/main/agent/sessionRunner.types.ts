import type {
  AgentEvent,
  AgentSendContext,
  AgentSendResult,
  CollaborationMode,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import type { ContextCompactor } from "./contextCompactor"
import type { Agent } from "./core/agent"
import type { TurnContext } from "./core/turnContext"
import type { PersonalityName } from "./prompts/personalities"
import type { AgentSessionRunner } from "./sessionRunner"
import type { LoadedSkill } from "./skills/skillLoader"
import type { SubagentPool } from "./subagent/subagentPool"
import type { SubagentRuntime } from "./subagent/subagentRuntime"
import type { ToolRegistry } from "./tools/registry"
import type { AttachedFile, SessionBinding, TurnStore } from "./turnStore"

// 排队消息：文本 + 完整发送上下文（附件/cwd），drain 时与直接发送语义一致。
export interface QueuedMessage {
  text: string
  context?: AgentSendContext
}

export interface SessionRunnerOptions {
  sessionId: string | null
  tabId?: string
  eventSink?: (event: AgentEvent) => void
  onSessionCreated?: (runner: AgentSessionRunner, oldKey: string, newSessionId: string) => void
}

/**
 * 内部协作面：sessionRunner 拆分模块通过该接口访问运行器状态与操作。
 * 仅限 src/main/agent/sessionRunner*.ts 内部使用；外部调用方仍只使用 AgentSessionRunner 的公开 API。
 */
export interface SessionRunnerHost {
  // --- 会话标识 ---
  currentSessionId: string | null
  tabId?: string
  // --- 运行态 ---
  agent?: Agent
  registry?: ToolRegistry
  cwd?: string
  requestedCwd?: string
  requestedModel?: ModelSelection
  personality?: PersonalityName
  sessionBinding: SessionBinding | null
  activeCapabilities: string[]
  activeMcp: string[]
  activeSkills: LoadedSkill[]
  collaborationMode: CollaborationMode
  builtSignature: string
  subagentPool: SubagentPool
  subagentRuntime?: SubagentRuntime
  currentTurnContext?: TurnContext
  // --- 队列与工具守卫状态 ---
  messageQueue: QueuedMessage[]
  draining: boolean
  guardReminders: Map<string, string>
  sessionStartFired: boolean
  // --- 只读协作者 ---
  readonly turnStore: TurnStore
  readonly compactor: ContextCompactor
  // --- 核心操作 ---
  emitEvent(event: AgentEvent): void
  setSessionId(sessionId: string | null): void
  isBusy(): boolean
  getEffectiveCwd(): string | undefined
  abort(): void
  ensureReady(): { agent: Agent } | { error: string }
  // 轮次执行（实现见 sessionRunnerTurns.ts）：队列 drain 与 send 共用，经类委托避免模块循环依赖。
  runOne(text: string, files?: AttachedFile[], overrideCwd?: string): Promise<AgentSendResult>
}
