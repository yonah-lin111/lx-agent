import type { CollaborationMode, SandboxPolicy } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { collectEnvironmentVariables } from "../assembly"

export interface TurnEnvironmentSnapshot {
  cwd: string
  isWorktree: boolean
  gitBranch?: string
  variables: Record<string, string | undefined>
  createdAt: number
}

export interface TurnContextOptions {
  turnId: string
  sessionId: string
  cwd: string
  modelSelection?: ModelSelection
  capabilities: string[]
  sandboxPolicy?: SandboxPolicy
  collaborationMode?: CollaborationMode
}

/**
 * 封装单轮对话（Turn）的执行上下文与环境切片。
 * 遵循 Codex 的 Turn 状态机模型，保证环境感知与运行时状态的确定性与隔离。
 */
export class TurnContext {
  public readonly turnId: string
  public readonly sessionId: string
  public readonly snapshot: TurnEnvironmentSnapshot
  public readonly modelSelection?: ModelSelection
  public readonly capabilities: string[]
  public readonly sandboxPolicy?: SandboxPolicy
  public readonly collaborationMode: CollaborationMode
  private toolCallCount = 0
  private readonly startTime: number

  constructor(options: TurnContextOptions) {
    this.turnId = options.turnId
    this.sessionId = options.sessionId
    this.modelSelection = options.modelSelection
    this.capabilities = [...options.capabilities]
    this.sandboxPolicy = options.sandboxPolicy
    this.collaborationMode = options.collaborationMode ?? "default"
    this.startTime = Date.now()

    const vars = collectEnvironmentVariables(options.cwd)
    this.snapshot = {
      cwd: options.cwd,
      isWorktree: vars.is_worktree === "true",
      gitBranch: vars.git_branch,
      variables: vars,
      createdAt: this.startTime,
    }
  }

  /** 记录工具调用 */
  public recordToolCall(): number {
    this.toolCallCount += 1
    return this.toolCallCount
  }

  /** 获取本轮工具调用总数 */
  public getToolCallCount(): number {
    return this.toolCallCount
  }

  /** 获取本轮执行耗时（毫秒） */
  public getDurationMs(): number {
    return Date.now() - this.startTime
  }
}
