// btw 侧问契约：一次性无工具模型调用，不进入主会话与数据库。

import type { ModelSelection } from "@shared/settings"

// btw 上下文消息（主会话上下文与侧问线历史共用的文本消息形状）。
export interface BtwContextMessage {
  role: "user" | "assistant"
  content: string
}

// btw 侧问请求：主会话上下文 + 本侧问线历史 + 本次问题 + 模型选择。
export interface BtwAskRequest {
  context: BtwContextMessage[]
  history: BtwContextMessage[]
  question: string
  selection?: ModelSelection
}

// btw 侧问结果：一次性返回完整回答；失败时返回错误文案，不抛异常穿透 IPC。
export type BtwAskResult = { ok: true; answer: string } | { ok: false; error: string }
