import type { AgentUndoDiffSummary } from "@shared/contracts/agent"
import { useCallback } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import type { AgentInputFile } from "@/features/agent/components/AgentInput"
import { agentFileRevertStore } from "@/features/agent/hooks/agentFileRevertStore"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import type { AgentChatCore, AgentChatFrames } from "@/features/agent/hooks/useAgentChat.types"
import type { AgentUndoOption, ChatBlock, ChatMessage } from "@/features/agent/types"
import { cleanUserPrompt, toAgentMessages } from "@/features/agent/utils"

/**
 * 轮次生命周期：停止生成、新建对话、删除/撤销轮次与上下文压缩。
 */
export const useAgentChatTurns = ({
  core,
  frames,
}: {
  core: Pick<
    AgentChatCore,
    | "tabId"
    | "toasts"
    | "t"
    | "isStreaming"
    | "isCompacting"
    | "messagesRef"
    | "currentSessionIdRef"
    | "activeCompactionIdsRef"
    | "streamingRef"
    | "setMessages"
    | "setInputText"
    | "setSelectedFiles"
    | "setTodos"
    | "setCurrentSessionId"
    | "setIsStreaming"
    | "setQueuedCount"
    | "setQueuedMessages"
    | "setIsCompacting"
    | "setIsCompactingManual"
    | "setIsRestoring"
  >
  frames: Pick<AgentChatFrames, "discardPendingStreamUpdates">
}) => {
  const { tabId, toasts, t, isStreaming, isCompacting } = core
  const { error: errorToast, success: successToast } = toasts
  const {
    messagesRef,
    currentSessionIdRef,
    activeCompactionIdsRef,
    streamingRef,
    setMessages,
    setInputText,
    setSelectedFiles,
    setTodos,
    setCurrentSessionId,
    setIsStreaming,
    setQueuedCount,
    setQueuedMessages,
    setIsCompacting,
    setIsCompactingManual,
    setIsRestoring,
  } = core
  const { discardPendingStreamUpdates } = frames

  // 停止流式生成：中止 main 侧 run（排队消息由 main 清空并推 queue_changed{0}，此处先本地归零）。
  const stopStreaming = useCallback(() => {
    void agentApi.abort(currentSessionIdRef.current ?? undefined, tabId)
    setIsStreaming(false)
    discardPendingStreamUpdates()
    streamingRef.current = null
    setQueuedCount(0)
    setQueuedMessages([])
    setMessages((prev) =>
      prev.map((message) =>
        message.isStreaming
          ? {
              ...message,
              isStreaming: false,
              ...(message.role === "assistant" ? { stopReason: "aborted" as const } : {}),
            }
          : message,
      ),
    )
  }, [tabId, discardPendingStreamUpdates])

  // 新建/重置对话：脱离当前会话并清空 main 侧上下文。即时完成，不展示骨架屏。
  const createNewChat = useCallback(() => {
    stopStreaming()
    activeCompactionIdsRef.current.clear()
    setIsCompacting(false)
    setIsCompactingManual(false)
    setIsRestoring(false)
    setMessages([])
    setInputText("")
    setTodos([])
    setCurrentSessionId(null)
    if (tabId) {
      agentTabStore.setTabSessionId(tabId, null)
      agentTabStore.setTabTitle(tabId, "")
    }
    void agentApi.restore([], undefined, tabId)
  }, [stopStreaming, tabId])

  // 删除一轮对话：移除该轮（问题 + 回答 + 工具调用）并插入撤销摘要，同步 main 侧上下文与 DB。
  // 未命中 DB 用户消息 timestamp（幽灵消息）时仅做本地移除。
  const removeTurn = useCallback(
    (userIndex: number, revertFiles?: boolean): void => {
      const list = messagesRef.current
      const userTimestamp = list[userIndex]?.timestamp
      let nextUserIndex = list.length
      for (let index = userIndex + 1; index < list.length; index++) {
        if (list[index].role === "user") {
          nextUserIndex = index
          break
        }
      }

      // 提取被撤销轮次中的核心数据（问题、助手回复、工具调用与代码 Diff）。
      const removedMessages = list.slice(userIndex, nextUserIndex)
      const userMessage = removedMessages[0]
      const assistantMessage = removedMessages.find((m) => m.role === "assistant")

      const rawUserPrompt = userMessage?.blocks
        .filter((b): b is Extract<ChatBlock, { kind: "text" }> => b.kind === "text")
        .map((b) => b.text)
        .join("\n")
      const userPrompt = rawUserPrompt
        ? cleanUserPrompt(rawUserPrompt, {
            isSteer: userMessage?.isSteer,
            command: userMessage?.command,
          })
        : undefined

      const assistantSnippet = assistantMessage?.blocks
        .filter((b): b is Extract<ChatBlock, { kind: "text" }> => b.kind === "text")
        .map((b) => b.text)
        .join("\n")

      const diffs: AgentUndoDiffSummary[] = []
      const toolCalls: { toolName: string; summary?: string }[] = []

      for (const msg of removedMessages) {
        for (const block of msg.blocks) {
          if (block.kind === "toolCall") {
            const summary =
              typeof block.args?.path === "string"
                ? block.args.path
                : typeof block.args?.filePath === "string"
                  ? block.args.filePath
                  : typeof block.args?.command === "string"
                    ? block.args.command.slice(0, 60)
                    : typeof block.args?.pattern === "string"
                      ? String(block.args.pattern)
                      : undefined
            toolCalls.push({
              toolName: block.toolName,
              summary,
            })
          }
          if (block.kind === "toolResult" && block.diff) {
            const filePath =
              block.diff.fileName ||
              toolCalls.find((tc) => tc.toolName === block.toolName)?.summary ||
              "Modified file"
            diffs.push({
              filePath,
              diff: block.diff,
              toolName: block.toolName,
            })
          }
        }
      }

      // 删除/撤销的文件回退语义：显式参数优先；缺省保持"仅末轮回退"旧行为（选项面板接入前的过渡）。
      const isLastUserTurn = !list.slice(nextUserIndex).some((message) => message.role === "user")
      const shouldRevertFiles = revertFiles ?? isLastUserTurn

      const undoSummaryMessage: ChatMessage = {
        id: `undo-summary-${Date.now()}`,
        role: "undoSummary",
        blocks: userPrompt ? [{ kind: "text", text: userPrompt }] : [],
        isStreaming: false,
        timestamp: Date.now(),
        undoPayload: {
          userPrompt,
          files: userMessage?.files,
          assistantSnippet,
          modelName: assistantMessage?.model,
          turnDurationMs: assistantMessage?.durationMs,
          diffs,
          toolCalls,
          toolCallCount: toolCalls.length,
          fileChangeCount: diffs.length,
          filesReverted: shouldRevertFiles && diffs.length > 0,
          undoneAt: Date.now(),
        },
      }

      // 保留被移除范围内的压缩摘要（自动压缩不可随轮撤销消失；手动摘要由撤销压缩路径单独处理）。
      const keptSummaries = removedMessages.filter(
        (message) => message.role === "compactionSummary",
      )
      const nextMessages = [
        ...list.slice(0, userIndex),
        undoSummaryMessage,
        ...keptSummaries,
        ...list.slice(nextUserIndex),
      ]

      // 检查剩余消息：若全空或只剩初始模型/撤销摘要，脱离并移除当前会话（会话的所有 undo 记录随之清空，直接回到新会话草稿态）
      const hasMeaningfulMessages = nextMessages.some(
        (m) =>
          !(m.role === "modelSwitch" && m.isInitial) &&
          m.role !== "modeSwitch" &&
          m.role !== "undoSummary",
      )
      if (!hasMeaningfulMessages) {
        setMessages([])
        setTodos([])
        setCurrentSessionId(null)
        if (tabId) {
          agentTabStore.setTabSessionId(tabId, null)
          agentTabStore.setTabTitle(tabId, "")
        }
        void agentApi.restore([], undefined, tabId)
      } else {
        setMessages(nextMessages)
        const sessionId = currentSessionIdRef.current
        void agentApi.restore(toAgentMessages(nextMessages), sessionId ?? undefined, tabId)
      }

      const sessionId = currentSessionIdRef.current
      if (sessionId && typeof userTimestamp === "number") {
        // 该轮已消失：本地回退标记同步清除（源轮 item 一并消失）。
        agentFileRevertStore.removeTurnMarks(sessionId, userTimestamp)
        // 落库成功后再刷新列表，避免读到删除前的旧会话。
        void agentApi
          .deleteMessageTurn(sessionId, userTimestamp, shouldRevertFiles)
          .then(() => {
            void sessionListStore.refresh()
          })
          .catch(() => {
            // 写库失败为尽力而为：本地已移除，DB 仅多留一轮。
          })
      }
    },
    [tabId],
  )

  // 撤销最后一次手动压缩（/undo 对压缩摘要触发）：清 main 侧边界/entry 后移除可见摘要，并同步 main 侧消息列表。
  // 自动压缩摘要不可撤销，不进入此路径。
  const undoManualCompaction = useCallback(() => {
    void agentApi.undoCompaction(currentSessionIdRef.current ?? undefined, tabId).then((result) => {
      if (result.ok) {
        const nextMessages = messagesRef.current.filter(
          (message) => !(message.role === "compactionSummary" && message.isManual),
        )
        setMessages(nextMessages)
        void agentApi.restore(
          toAgentMessages(nextMessages),
          currentSessionIdRef.current ?? undefined,
          tabId,
        )
      } else {
        errorToast(result.error)
      }
    })
  }, [errorToast, tabId])

  // 撤销/删除选项执行：回退文件并撤销对话 / 仅撤销对话 / 仅回退文件（保留对话）。
  // 被撤销的用户消息回显到输入框（仅撤销对话的两个选项），便于修改后重新发送。
  const applyUndoOption = useCallback(
    (option: AgentUndoOption): void => {
      if (isStreaming || isCompacting) return
      const list = messagesRef.current
      const last = list.at(-1)
      // 末条为压缩摘要：手动可撤销，自动不可撤销（提示并阻止误撤其下轮）。
      if (last?.role === "compactionSummary") {
        // 压缩摘要撤销清空输入框（命令文本不残留）；QA 撤销仍回显（见下）。
        setInputText("")
        if (last.isManual) {
          undoManualCompaction()
        } else {
          errorToast(t("agent.autoCompactionNotReversible"))
        }
        return
      }
      const lastUserIndex = list.findLastIndex((message) => message.role === "user")
      if (lastUserIndex < 0) return
      const userMessage = list[lastUserIndex]
      const userTimestamp = userMessage.timestamp

      // 仅回退文件：保留对话，按该轮快照恢复并写入回退标记（下轮注入 agent 提示）。
      if (option === "revert_only") {
        const sessionId = currentSessionIdRef.current
        if (!sessionId || typeof userTimestamp !== "number") return
        void agentApi
          .revertTurnFiles(sessionId, userTimestamp)
          .then((result) => {
            if (!result.ok) {
              errorToast(t("agent.revertFileFailed"))
              return
            }
            agentFileRevertStore.addMarks(
              sessionId,
              result.files.map((file) => ({
                userMessageTimestamp: userTimestamp,
                file,
                revertedAt: result.revertedAt,
              })),
            )
            successToast(t("agent.revertTurnFilesSuccess", { count: result.files.length }))
          })
          .catch(() => errorToast(t("agent.revertFileFailed")))
        return
      }

      const rawEchoed = userMessage.blocks
        .filter((block): block is Extract<ChatBlock, { kind: "text" }> => block.kind === "text")
        .map((block) => block.text)
        .join("\n")
      const echoed = cleanUserPrompt(rawEchoed, {
        isSteer: userMessage.isSteer,
        command: userMessage.command,
      })
      setInputText(echoed)

      // 回显附件文件到输入框：直接使用复制路径回显
      if (userMessage.files && userMessage.files.length > 0) {
        const echoedFiles: AgentInputFile[] = userMessage.files.map((file, idx) => ({
          id: `undo-${Date.now()}-${idx}`,
          name: file.name,
          path: file.path,
          type: file.type,
          size: file.size,
          extension: file.extension,
        }))
        setSelectedFiles(echoedFiles)
      } else {
        setSelectedFiles([])
      }

      removeTurn(lastUserIndex, option === "revert_and_delete")
    },
    [isStreaming, isCompacting, removeTurn, undoManualCompaction, errorToast, successToast, t],
  )

  // 兼容入口：撤销上一轮（等价于"回退文件并撤销对话"）。
  const undoLastTurn = useCallback((): void => {
    applyUndoOption("revert_and_delete")
  }, [applyUndoOption])

  // 手动压缩上下文（/compact 命令触发）：流式时阻塞提示；其余情况调用 main 侧强制压缩。
  // 失败或无可压缩内容时由 main 侧直接返回具体原因 error 文案并 toast 提示。
  const compactChat = useCallback(() => {
    if (isStreaming) {
      errorToast(t("agent.compactionBlockedWhileGenerating"))
      return
    }
    void agentApi.compact(currentSessionIdRef.current ?? undefined, tabId).then((result) => {
      if (!result.ok) {
        errorToast(result.error)
        return
      }
      successToast(t("agent.contextCompactedSuccess"))
    })
  }, [isStreaming, errorToast, successToast, t, tabId])

  return {
    stopStreaming,
    createNewChat,
    removeTurn,
    undoManualCompaction,
    undoLastTurn,
    applyUndoOption,
    compactChat,
  }
}
