import type { QuestionAnswer, QuestionPrompt, QuestionRequest } from "@shared/contracts/agent"

// 提问请求的待挂起项。
interface PendingQuestion {
  finish: (answers: QuestionAnswer[] | null) => void
}

/**
 * 模型执行中提问管理器（main 进程单例）。
 *
 * question 工具执行时挂起：ask 推 question_request 事件到 renderer 命令面板，
 * 等待用户作答（respond）或 dismiss；run abort / 关闭均按"用户未回答"（null）
 * 解除挂起——工具据此返回 error toolResult，模型继续自行收尾，对齐 permission fail-safe。
 * 父/子代理共用同一单例（question 为 sequential，天然与 permission 互斥）。
 */
class QuestionManager {
  // 挂起的提问请求：requestId → finish。
  private pending = new Map<string, PendingQuestion>()
  // 提问请求推送目标（agentHandlers 注入）。
  private sendRequest: ((request: QuestionRequest) => void) | null = null
  private requestSequence = 0

  // 注入提问请求推送目标（renderer 命令面板）。
  attachSender(sender: (request: QuestionRequest) => void): void {
    this.sendRequest = sender
  }

  /**
   * 挂起一次提问，等待用户作答；返回 null 表示用户未回答（dismiss/abort）。
   */
  ask(
    questions: QuestionPrompt[],
    sessionId: string | null,
    toolCallId: string,
    signal?: AbortSignal,
  ): Promise<QuestionAnswer[] | null> {
    const requestId = `${sessionId ?? "global"}:${++this.requestSequence}`
    return new Promise((resolve) => {
      let settled = false
      const onAbort = (): void => finish(null)
      const finish = (answers: QuestionAnswer[] | null): void => {
        if (settled) return
        settled = true
        signal?.removeEventListener("abort", onAbort)
        this.pending.delete(requestId)
        resolve(answers)
      }

      if (signal?.aborted) {
        onAbort()
        return
      }
      signal?.addEventListener("abort", onAbort, { once: true })
      this.pending.set(requestId, { finish })
      // 无推送目标（未接线）时按"用户未回答"处理（fail-safe）。
      if (!this.sendRequest) {
        finish(null)
        return
      }
      this.sendRequest({ requestId, toolCallId, questions, sessionId })
    })
  }

  /**
   * 处理 renderer 的提问响应；未知/过期 requestId 返回 false。
   * dismissed=true 或 answers=null 均按"用户未回答"解除挂起。
   */
  respond(requestId: string, answers: QuestionAnswer[] | null): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    pending.finish(answers)
    return true
  }

  // 会话切换/结束时清理：该会话挂起的提问按"用户未回答"解除。
  clearSession(sessionId: string): void {
    const prefix = `${sessionId}:`
    for (const [requestId, pending] of this.pending) {
      if (requestId.startsWith(prefix)) {
        this.pending.delete(requestId)
        pending.finish(null)
      }
    }
  }
}

// QuestionManager 单例。
export const questionManager = new QuestionManager()
