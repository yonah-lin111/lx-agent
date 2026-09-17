import type { SubagentData } from "@shared/contracts/agent"
import type { Agent } from "../core/agent"

export interface ManagedSubagent {
  subagentId: string
  name: string
  agent: Agent
  data?: Partial<SubagentData>
  // 创建时固定的角色名（缺省 = 默认子代理）；续接时角色不可变更。
  roleName?: string
  createdAt: number
  lastActiveAt: number
}

// 池容量与空闲回收配置（测试可注入小值）。
export interface SubagentPoolOptions {
  // 条目上限（默认 16）。
  maxSize?: number
  // 空闲 TTL（默认 30 分钟）。
  idleTtlMs?: number
}

// 默认容量上限。
const DEFAULT_MAX_SIZE = 16

// 默认空闲 TTL。
const DEFAULT_IDLE_TTL_MS = 30 * 60 * 1000

/**
 * 会话级子代理池管理器（Session-Scoped Subagent Pool）。
 *
 * 负责跟踪和持久化当前父会话中的子代理 Agent 实例，
 * 使得主 Agent 可以通过 subagent_id 多次调用同一个子代理并保留上下文。
 * 容量与空闲回收：超限按 lastActiveAt 淘汰最久的非运行条目，全在运行则暂时超限不打断。
 */
export class SubagentPool {
  private readonly agents = new Map<string, ManagedSubagent>()
  private readonly maxSize: number
  private readonly idleTtlMs: number

  constructor(options: SubagentPoolOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS
  }

  /**
   * 获取子代理实例（精确按 id 获取）
   */
  get(subagentId: string): ManagedSubagent | undefined {
    return this.agents.get(subagentId)
  }

  /**
   * 按 subagentId 或 name 解析子代理实例（精确匹配优先，未命中时回退角色名）
   */
  resolve(target: string): ManagedSubagent | undefined {
    this.pruneIdle()
    const trimmed = target.trim()
    if (!trimmed) return undefined
    // 1. 精确匹配 subagentId
    const direct = this.agents.get(trimmed)
    if (direct) return direct

    // 2. 按 name / nickname 匹配最新激活的子代理
    const matches = Array.from(this.agents.values()).filter((item) => item.name === trimmed)
    if (matches.length === 0) return undefined
    // 返回最近活跃的一个
    matches.sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    return matches[0]
  }

  /**
   * 注册或更新子代理
   */
  set(subagentId: string, item: ManagedSubagent): void {
    this.pruneIdle()
    this.agents.set(subagentId, item)
    this.enforceCapacity()
  }

  /**
   * 检查是否存在
   */
  has(subagentId: string): boolean {
    return this.agents.has(subagentId)
  }

  /**
   * 获取当前全部子代理
   */
  list(): ManagedSubagent[] {
    return Array.from(this.agents.values())
  }

  /**
   * 释放并清空所有子代理（切会话或销毁会话时调用）
   */
  clear(): void {
    for (const item of this.agents.values()) {
      this.abortQuietly(item)
    }
    this.agents.clear()
  }

  /**
   * 判定子代理是否运行中：Agent 存在活动 run（signal）时为运行中，不参与淘汰。
   */
  private isRunning(item: ManagedSubagent): boolean {
    return item.agent.signal !== undefined
  }

  /**
   * 空闲回收（惰性）：超过 TTL 的非运行条目移除并释放。
   */
  private pruneIdle(now: number = Date.now()): void {
    for (const [subagentId, item] of [...this.agents.entries()]) {
      if (now - item.lastActiveAt <= this.idleTtlMs || this.isRunning(item)) continue
      this.agents.delete(subagentId)
      this.abortQuietly(item)
    }
  }

  /**
   * 容量淘汰：按 lastActiveAt 从旧到新移除非运行条目；全在运行则暂时超限（不打断运行）。
   */
  private enforceCapacity(): void {
    if (this.agents.size <= this.maxSize) return
    const candidates = [...this.agents.values()]
      .filter((item) => !this.isRunning(item))
      .sort((a, b) => a.lastActiveAt - b.lastActiveAt)
    for (const item of candidates) {
      if (this.agents.size <= this.maxSize) break
      this.agents.delete(item.subagentId)
      this.abortQuietly(item)
    }
  }

  /**
   * 静默释放子代理（淘汰/清空共用；abort 失败不阻塞）。
   */
  private abortQuietly(item: ManagedSubagent): void {
    try {
      item.agent.abort()
    } catch (err) {
      console.warn(`Failed to abort subagent ${item.subagentId}:`, err)
    }
  }
}
