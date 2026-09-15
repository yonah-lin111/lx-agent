// 提问契约：选项、单个提问、请求/响应与答案。

// 提问选项（question 工具选择题的候选项）。
export interface QuestionOption {
  label: string
  description?: string
}

// 单个提问（question 工具）。
export interface QuestionPrompt {
  // 简短纯文本提问（提交列表只读展示与答案回灌）。
  question: string
  // 短标签 chip（≤12 字符），UI 展示用。
  header?: string
  // 选择题候选（2..4 个）；缺省为自由文本输入。
  options?: QuestionOption[]
  // 多选（仅选择题生效）。
  multiSelect?: boolean
}

// 提问请求（main → renderer，渲染于消息流内的 question 工具调用块）。
export interface QuestionRequest {
  requestId: string
  // 触发本提问的 question 工具调用 id（renderer 据此定位消息流内的工具块）。
  toolCallId: string
  questions: QuestionPrompt[]
  sessionId: string | null
}

// 单个提问的答案（answer 恒数组：单选/自由文本长度 1，多选多值）。
export interface QuestionAnswer {
  question: string
  answer: string[]
}

// 提问响应（renderer → main；dismissed=true 表示用户关闭未作答）。
export type QuestionResponse =
  | { requestId: string; answers: QuestionAnswer[] }
  | { requestId: string; dismissed: true }
