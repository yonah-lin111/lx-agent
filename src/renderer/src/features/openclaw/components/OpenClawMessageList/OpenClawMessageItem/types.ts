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
}
