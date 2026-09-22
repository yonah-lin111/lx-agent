import type { OpenClawChatMessage } from "@shared/contracts/openclaw"

export interface ConversationAgent {
  agentId: string
  name: string
  accent: string
  // 会话级当前模型（snapshot.stats.model）；用于消息自身未记录模型时的兜底展示。
  model?: string
}

export interface OpenClawMessageItemProps {
  agentId: string
  message: OpenClawChatMessage
  agent?: ConversationAgent
  targetAgents?: ConversationAgent[]
  isStreaming?: boolean
  // 解析后的模型名（消息自带或按 Agent 回退）；缺省时回落到 message.model。
  model?: string
  // 删除该助手消息所在的一轮问答（仅该 Agent 最后一条非流式 AI 消息提供入口）。
  onDelete?: (messageId: string) => void
}
