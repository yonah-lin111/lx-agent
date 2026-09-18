import { homedir } from "node:os"
import { join } from "node:path"
import type { AgentSendContext } from "@shared/contracts/agent"
import { getDefaultCapabilities } from "@/services/capabilityService"
import { resolveCwd } from "./assembly"
import { hooksManager } from "./hooks"
import { lspManager } from "./lsp/lspManager"
import { permissionManager } from "./permissions/permissionManager"
import { questionManager } from "./question/questionManager"
import type { SessionRunnerHost } from "./sessionRunner.types"
import { resolveInjectedSkills, resolveMcpTools } from "./sessionRunnerInput"
import { discardPendingTurn } from "./sessionRunnerTurns"
import { unifiedExecManager } from "./shell/unifiedExecManager"

/**
 * 会话生命周期：新会话状态冻结、运行资源清理与会话销毁。
 */
export const freezeNewSession = (host: SessionRunnerHost, context: AgentSendContext): void => {
  if (host.currentSessionId) return
  host.sessionBinding = {
    projectId: context.projectId,
    page: context.page,
  }
  const cwd = context.cwd ?? (context.projectId ? resolveCwd() : join(homedir(), "Desktop"))
  if (cwd) host.requestedCwd = cwd
  if (context.personality) {
    host.personality = context.personality
  }
  const snapshot = getDefaultCapabilities()
  host.activeCapabilities = snapshot.tools
  host.activeMcp = resolveMcpTools()
  host.activeSkills = cwd ? resolveInjectedSkills(cwd) : []
}

// 清理当前会话的权限、提问、LSP、终端与子代理资源。
export const cleanUp = (host: SessionRunnerHost): void => {
  // 先丢弃进行中的 turn：abort 后的收尾事件仍会到达，若落盘输入未清，
  // 会话删除路径会向已删除的会话 flushTurn（外键错误）。
  discardPendingTurn(host)
  host.abort()
  if (host.currentSessionId) {
    permissionManager.clearSession(host.currentSessionId)
    questionManager.clearSession(host.currentSessionId)
    lspManager.clearSession(host.currentSessionId)
    unifiedExecManager.clearSession(host.currentSessionId)
    host.subagentPool.clear()
  }
  host.guardReminders.clear()
}

// 会话销毁：best-effort 派发 SessionEnd（不等待异步工作），再清理运行态。
export const dispose = (host: SessionRunnerHost, reason: "quit" | "dispose"): void => {
  const sessionId = host.currentSessionId
  if (sessionId) {
    void hooksManager.dispatchBestEffort({
      event: "SessionEnd",
      sessionId,
      cwd: host.getEffectiveCwd(),
      payload: { reason },
    })
  }
  cleanUp(host)
  host.sessionStartFired = false
}
