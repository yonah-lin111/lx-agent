import type { Agent } from "../core/agent"
import type { SubagentData } from "@shared/contracts/agent"

export interface ManagedSubagent {
  subagentId: string
  name: string
  agent: Agent
  data?: Partial<SubagentData>
  createdAt: number
  lastActiveAt: number
}

/**
 * 会话级子代理池管理器（Session-Scoped Subagent Pool）。
 *
 * 负责跟踪和持久化当前父会话中的子代理 Agent 实例，
 * 使得主 Agent 可以通过 subagent_id 多次调用同一个子代理并保留上下文。
 */
export class SubagentPool {
  private readonly agents = new Map<string, ManagedSubagent>()

  /**
   * 获取子代理实例（精确按 id 获取）
   */
  get(subagentId: string): ManagedSubagent | undefined {
    return this.agents.get(subagentId)
  }

  /**
   * 按 subagentId 或 name 解析子代理实例（对齐 Codex resolve_agent_target 容错机制）
   */
  resolve(target: string): ManagedSubagent | undefined {
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
    this.agents.set(subagentId, item)
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
      try {
        item.agent.abort()
      } catch (err) {
        console.warn(`Failed to abort subagent ${item.subagentId}:`, err)
      }
    }
    this.agents.clear()
  }
}
