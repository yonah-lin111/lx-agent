import type { OpenClawChatMessage } from "@shared/contracts/openclaw"

export interface ConversationAgent {
  agentId: string
  name: string
  accent: string
}

// AI 消息名称右侧概要与 tooltip 的展示数据（优先该条消息记录值，流式回退会话级实时值）。
export interface OpenClawMessageStats {
  model?: string
  modelProvider?: string
  contextUsed?: number
  contextWindow?: number
  // 该条消息的输出 token（仅历史水合与 run 结束回填后存在）。
  outputTokens?: number
}

export interface OpenClawMessageItemProps {
  agentId: string
  message: OpenClawChatMessage
  agent?: ConversationAgent
  targetAgents?: ConversationAgent[]
  isStreaming?: boolean
  stats?: OpenClawMessageStats
}
