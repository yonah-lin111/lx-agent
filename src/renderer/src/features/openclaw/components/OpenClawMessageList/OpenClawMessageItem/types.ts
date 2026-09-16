import type { OpenClawChatMessage } from "@shared/contracts/openclaw"

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
  // 删除该助手消息所在的一轮问答（仅该 Agent 最后一条非流式 AI 消息提供入口）。
  onDelete?: (messageId: string) => void
}
