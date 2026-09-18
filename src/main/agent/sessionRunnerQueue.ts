import type { AgentSendContext, AgentSendResult } from "@shared/contracts/agent"
import type { SessionRunnerHost } from "./sessionRunner.types"

// 排队消息上限（流式中入队；超限明确报错，不覆盖、不静默丢）。
export const MAX_QUEUE = 20

// 队列协作面：仅需队列状态、事件下发与轮次执行能力。
type QueueHost = Pick<
  SessionRunnerHost,
  "messageQueue" | "draining" | "currentSessionId" | "emitEvent" | "runOne"
>

// 下发排队消息快照（入队/出队/清空时）。
export const emitQueueChanged = (host: Pick<QueueHost, "messageQueue" | "emitEvent">): void => {
  host.emitEvent({
    type: "queue_changed",
    length: host.messageQueue.length,
    messages: host.messageQueue.map((item) => item.text),
  })
}

// 入队：超限拒绝并明确报错，不覆盖、不静默丢。
export const enqueueMessage = (
  host: QueueHost,
  text: string,
  context?: AgentSendContext,
): AgentSendResult => {
  if (host.messageQueue.length >= MAX_QUEUE) {
    return {
      ok: false,
      error: `消息队列已满（最多 ${MAX_QUEUE} 条），请等待当前回复完成后发送。`,
    }
  }
  host.messageQueue.push({ text, ...(context ? { context } : {}) })
  emitQueueChanged(host)
  return {
    ok: true,
    queued: true,
    queueLength: host.messageQueue.length,
    sessionId: host.currentSessionId ?? "",
  }
}

// 清空排队消息（仅在非空时下发快照）。
export const clearQueue = (host: Pick<QueueHost, "messageQueue" | "emitEvent">): void => {
  if (host.messageQueue.length === 0) return
  host.messageQueue = []
  emitQueueChanged(host)
}

// 串行 drain：逐条作为独立 turn 执行；draining 置位期间禁止重入。
export const kickDrain = async (
  host: Pick<QueueHost, "draining" | "messageQueue" | "emitEvent" | "runOne">,
): Promise<void> => {
  if (host.draining) return
  host.draining = true
  try {
    while (host.messageQueue.length > 0) {
      const item = host.messageQueue.shift()!
      emitQueueChanged(host)
      // 单条消息失败（hook/DB 等前置阶段抛错）不得中断 drain：先出队再执行，
      // 异常穿出会让剩余消息滞留且无人再触发 drain（isBusy 恒真 → 活锁）。
      try {
        await host.runOne(item.text, item.context?.files, item.context?.cwd)
      } catch (error) {
        console.error(`Queued message failed and was dropped: ${item.text}`, error)
      }
    }
  } finally {
    host.draining = false
  }
}
