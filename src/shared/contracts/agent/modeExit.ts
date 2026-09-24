// 模式退出审批契约：auto 编排下模型退出只读有效模式（plan / review / design）回 build 的用户批准请求。

import type { CollaborationMode } from "./permissions"

// 模式退出审批请求（main → renderer，渲染于消息流内的 switch_mode 工具调用块）。
export interface ModeExitRequest {
  requestId: string
  // 触发本次审批的 switch_mode 工具调用 id（renderer 据此定位消息流内的工具块）。
  toolCallId: string
  // 只读有效模式（plan / review / design）。
  fromMode: CollaborationMode
  // 退出目标（恒为 build）。
  toMode: CollaborationMode
  sessionId: string | null
}

// 模式退出审批响应（renderer → main；dismissed=true 表示挂起被撤销按拒绝处理）。
export type ModeExitResponse =
  | { requestId: string; decision: "allow" | "deny" }
  | { requestId: string; dismissed: true }
