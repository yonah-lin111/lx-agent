import type { CollaborationMode } from "@shared/contracts/agent"
import { nextCollaborationMode } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { createChatMessageId } from "@/features/agent/hooks/agentChatStreamUtils"
import type { AgentChatCore } from "@/features/agent/hooks/useAgentChat.types"
import type { ProposedPlanData } from "@/features/agent/types"
import { toChatMessage, upsertSwitchMessage } from "@/features/agent/utils"

/**
 * 协作与模型域：协作模式切换、采纳计划/审查修复、模型切换与上下文容量刷新。
 */
export const useAgentChatCollaboration = ({
  core,
  sendMessage,
}: {
  core: Pick<
    AgentChatCore,
    | "collaborationMode"
    | "setCollaborationMode"
    | "setEffectiveMode"
    | "currentSessionIdRef"
    | "messagesRef"
    | "setMessages"
    | "setContextUsage"
    | "tabId"
  >
  sendMessage: (contentToSend?: string) => void
}) => {
  const { collaborationMode, currentSessionIdRef, messagesRef, tabId } = core
  const { setCollaborationMode, setEffectiveMode, setMessages, setContextUsage } = core

  // 直接切换到指定协作模式（点击状态栏模式列表选择）。
  const selectCollaborationMode = useCallback(
    (mode: CollaborationMode) => {
      void agentApi
        .setCollaborationMode(mode, currentSessionIdRef.current ?? undefined, tabId)
        .catch((err) => {
          console.error("Failed to set collaboration mode:", err)
        })
    },
    [tabId],
  )

  // 主动切换协作模式（按共享循环顺序切换到下一个模式）。
  const toggleCollaborationMode = useCallback(() => {
    selectCollaborationMode(nextCollaborationMode(collaborationMode))
  }, [collaborationMode, selectCollaborationMode])

  // 退出只读模式回 build：auto 下仅重置有效模式并保持编排（主进程按基础模式判定）。
  const exitToBuild = useCallback(async (): Promise<void> => {
    try {
      await agentApi.setEffectiveMode("build", currentSessionIdRef.current ?? undefined, tabId)
      setEffectiveMode("build")
      if (collaborationMode !== "auto") setCollaborationMode("build")
    } catch (err) {
      console.error("Failed to switch collaboration mode to build:", err)
    }
  }, [collaborationMode, setCollaborationMode, setEffectiveMode, tabId])

  // 采纳并执行实施方案（只读模式下自动退出回 build 并发送标准执行提示词）。
  const acceptAndExecutePlan = useCallback(
    async (_plan: ProposedPlanData) => {
      if (collaborationMode !== "build") {
        await exitToBuild()
      }
      const prompt = "Plan approved. Proceed with implementation step-by-step using todowrite."
      await sendMessage(prompt)
    },
    [collaborationMode, exitToBuild, sendMessage],
  )

  // 采纳并执行代码审查修复（切换至 build 模式并自动发送结构化修复任务指令）。
  const acceptAndExecuteReviewFixes = useCallback(
    async (
      selectedFindings: {
        title: string
        location: { filePath: string; lineStart: number }
        suggestion?: string
      }[],
    ) => {
      await exitToBuild()

      const issuesList = selectedFindings
        .map(
          (f, idx) =>
            `${idx + 1}. **${f.title}** at \`${f.location.filePath}:${f.location.lineStart}\`\n   - Fix suggestion: ${f.suggestion || "Fix the identified defect."}`,
        )
        .join("\n")

      const prompt = `Please fix the following issues identified during code review:\n\n${issuesList}\n\nProceed with precision and verify the fixes.`
      await sendMessage(prompt)
    },
    [exitToBuild, sendMessage],
  )

  // 主动刷新上下文容量（模型切换后调用；selection 指定目标模型窗口，不必等下一 turn 推送）。
  // 无会话（prev 为 null）时保持不显示，避免状态栏误现 0%。
  const refreshContextUsage = useCallback(
    (selection?: ModelSelection) => {
      void agentApi
        .getContextUsage(selection, currentSessionIdRef.current ?? undefined, tabId)
        .then((usage) => {
          setContextUsage((prev) => (prev === null ? null : usage))
        })
    },
    [tabId],
  )

  // 切换会话模型：向 main 进程发起 switchModel，并在成功后立即更新本地 messages 保证实时展示
  const switchModel = useCallback(
    async (selection: ModelSelection) => {
      const sessionId = currentSessionIdRef.current
      if (!sessionId) return { ok: true as const }
      const result = await agentApi.switchModel(selection, sessionId, tabId)
      if (result.ok && result.message) {
        const msg = result.message
        const item = toChatMessage(msg, false, createChatMessageId(), sessionId)
        setMessages((prev) => upsertSwitchMessage(prev, item))
      }
      return result
    },
    [tabId],
  )

  // 检查当前是否仅剩最后一轮用户对话（用于 /undo 二次确认判定）。
  const isOnlyOneTurnLeft = useCallback((): boolean => {
    const list = messagesRef.current
    const userTurnCount = list.filter((m) => m.role === "user").length
    return userTurnCount === 1
  }, [])

  return {
    selectCollaborationMode,
    toggleCollaborationMode,
    acceptAndExecutePlan,
    acceptAndExecuteReviewFixes,
    refreshContextUsage,
    switchModel,
    isOnlyOneTurnLeft,
  }
}
