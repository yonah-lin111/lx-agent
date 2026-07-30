// 消息角色类型。
export type AgentMessageRole = "user" | "assistant" | "system"

// 消息项定义。
export interface AgentMessage {
  id: string
  role: AgentMessageRole
  content: string
  createdAt: number
  isStreaming?: boolean
}

// 预设提示词卡片。
export interface AgentPromptCard {
  id: string
  title: string
  description: string
  prompt: string
}
