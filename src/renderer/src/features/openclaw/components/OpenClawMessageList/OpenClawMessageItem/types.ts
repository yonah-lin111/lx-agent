import type { OpenClawChatMessage, OpenClawSessionStats } from "@shared/contracts/openclaw"

export interface ConversationAgent {
  agentId: string
  name: string
  accent: string
}

export interface OpenClawMessageItemProps {
  agentId: string
  message: OpenClawChatMessage
  agent?: ConversationAgent
  targetAgents?: ConversationAgent[]
  isStreaming?: boolean
  // 会话级模型与上下文用量；仅最新一条 AI 消息传入。
  stats?: OpenClawSessionStats
}
