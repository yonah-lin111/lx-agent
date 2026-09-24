import type { CollaborationMode, ModeExitRequest } from "@shared/contracts/agent"

// 模式退出审批的待挂起项。
interface PendingModeExit {
  finish: (allowed: boolean) => void
}

/**
 * 模式退出审批管理器（main 进程单例）。
 *
 * auto 编排下模型调用 switch_mode("build") 退出只读有效模式（plan / review / design）时挂起：
 * 推送 mode_exit_request 事件到 renderer 消息流内的 switch_mode 工具块，等待用户批准或拒绝。
 * run abort / 会话切换（含用户手动切换模式）一律按"拒绝"解除挂起——退出审批永远属于用户。
 */
export class ModeExitManager {
  // 挂起的审批请求：requestId → finish。
  private pending = new Map<string, PendingModeExit>()
  // 审批请求推送目标（agentHandlers 注入）。
  private sendRequest: ((request: ModeExitRequest) => void) | null = null
  private requestSequence = 0

  // 注入审批请求推送目标（renderer 消息流内联确认块）。
  attachSender(sender: (request: ModeExitRequest) => void): void {
    this.sendRequest = sender
  }

  /**
   * 挂起一次模式退出审批，等待用户批准；返回 false 表示用户拒绝/挂起被撤销。
   */
  request(input: {
    sessionId: string | null
    toolCallId: string
    fromMode: CollaborationMode
    toMode: CollaborationMode
    signal?: AbortSignal
  }): Promise<boolean> {
    const requestId = `${input.sessionId ?? "global"}:${++this.requestSequence}`
    return new Promise((resolve) => {
      let settled = false
      const onAbort = (): void => finish(false)
      const finish = (allowed: boolean): void => {
        if (settled) return
        settled = true
        input.signal?.removeEventListener("abort", onAbort)
        this.pending.delete(requestId)
        resolve(allowed)
      }

      if (input.signal?.aborted) {
        onAbort()
        return
      }
      input.signal?.addEventListener("abort", onAbort, { once: true })
      this.pending.set(requestId, { finish })
      // 无推送目标（未接线）时按"拒绝"处理（fail-safe，不得绕过审批）。
      if (!this.sendRequest) {
        finish(false)
        return
      }
      this.sendRequest({
        requestId,
        toolCallId: input.toolCallId,
        fromMode: input.fromMode,
        toMode: input.toMode,
        sessionId: input.sessionId,
      })
    })
  }

  /**
   * 处理 renderer 的审批响应；未知/过期 requestId 返回 false。
   * dismissed=true 按"拒绝"解除挂起。
   */
  respond(requestId: string, allowed: boolean): boolean {
    const pending = this.pending.get(requestId)
    if (!pending) return false
    pending.finish(allowed)
    return true
  }

  // 会话切换/结束（含手动切换模式）时清理：该会话挂起的审批按"拒绝"解除。
  clearSession(sessionId: string | null): void {
    if (!sessionId) return
    const prefix = `${sessionId}:`
    for (const [requestId, pending] of this.pending) {
      if (requestId.startsWith(prefix)) {
        this.pending.delete(requestId)
        pending.finish(false)
      }
    }
  }
}

// ModeExitManager 单例。
export const modeExitManager = new ModeExitManager()
