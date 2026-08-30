import type { SuggestedQuestionContextMessage } from "@shared/contracts/agent"
import type { ChatBlock, ChatMessage } from "@/features/agent/types"

// 待作答提问块类型。
export type PendingQuestionBlock = Extract<ChatBlock, { kind: "question" }>

// 待作答权限块类型。
export type PendingPermissionBlock = Extract<ChatBlock, { kind: "permission" }>

// 工具调用块类型。
export type ToolCallBlock = Extract<ChatBlock, { kind: "toolCall" }>

// 执行组类型。
export interface ExecutionGroup {
  kind: "execution"
  blocks: {
    block: ToolCallBlock | Extract<ChatBlock, { kind: "thinking" }>
    isStreaming: boolean
  }[]
}

// 展示分组联合类型。
export type DisplayGroup =
  | { kind: "text"; block: Extract<ChatBlock, { kind: "text" }>; isStreaming: boolean }
  | ExecutionGroup
  // 编写操作调用独立组（不参与执行折叠，直接平铺展示）。
  | { kind: "writing"; block: ToolCallBlock; isStreaming: boolean }
  // 任务清单调用独立组（不参与执行折叠，逐条展示清单）。
  | { kind: "todo"; block: ToolCallBlock; isStreaming: boolean }
  // 模型提问调用独立组（不参与执行折叠，内联作答）。
  | { kind: "question"; block: ToolCallBlock; isStreaming: boolean }
  // 可视化图表调用独立组（不参与执行折叠，直观富图形展示）。
  | { kind: "visual"; block: ToolCallBlock; isStreaming: boolean }

// QA 聚合 token 用量。
export interface QaUsage {
  input: number
  output: number
  cacheRead: number
  totalTokens: number
}

// 命令标签对象。
export interface CommandTag {
  label: string
  sourceTag?: string
}

// AgentMessageItem 组件 Props 接口。
export interface AgentMessageItemProps {
  message: ChatMessage
  continuationMessages?: ChatMessage[]
  isLoading?: boolean
  isPinned?: boolean
  isEditing?: boolean
  // 是否为当前最后一条 AI 回答（仅该条目展示建议问题）。
  isLastAssistant?: boolean
  // 生成建议问题所需的完整会话上下文。
  suggestedQuestionContext?: SuggestedQuestionContextMessage[]
  // 点击建议问题直接发送。
  onSendSuggestedQuestion?: (question: string) => void
  // 点击建议问题回显到输入框并聚焦。
  onEchoToInput?: (question: string) => void
  onStartEdit?: () => void
  onCancelEdit?: () => void
  onEdit?: (id: string, newContent: string) => void
  onDelete?: (messageId: string) => void
  // 点击"从此分支"：从该用户轮切割复制历史到新会话（assistant / toolResult 消息不显示）。
  onFork?: (userMessageTimestamp: number) => void
  // 吸顶状态下点击"定位"：滚动回该消息在自然流中的原始位置（消息顶对齐列表视口顶部）。
  onLocate?: () => void
  // 点击子代理 label 打开面板弹窗。
  onOpenSubagent?: (toolCall: ToolCallBlock) => void
  // 只读模式（子代理面板内渲染，隐藏编辑/删除操作，保留复制）。
  readOnly?: boolean
  // 回到底部按钮是否可见（可见时由按钮接管 loader，隐藏条目内 loading 效果）。
  showScrollToBottom?: boolean
  // "继续生成"可用（最后一条 AI 回答被截断/中止且未在流式）。
  canContinue?: boolean
  // 点击"继续生成"：续写被中断的上一轮输出。
  onContinue?: () => void
}
