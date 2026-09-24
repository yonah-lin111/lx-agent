import type { AgentEvent } from "@shared/contracts/agent"
import { useCallback, useEffect } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { cancelFrame, createChatMessageId } from "@/features/agent/hooks/agentChatStreamUtils"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import type { AgentChatCore, AgentChatFrames } from "@/features/agent/hooks/useAgentChat.types"
import type { ChatMessage } from "@/features/agent/types"
import {
  extractQuestionAnswers,
  extractSubagentData,
  extractSubagentsData,
  toChatMessage,
  upsertSwitchMessage,
} from "@/features/agent/utils"
import { synthesizeDesignUpdate } from "@/features/agent/utils/designSynthesizer"

/**
 * 分发 main 进程推送的 AgentEvent，支持基于 sessionId 与 tabId 的精准路由。
 */
export const useAgentChatEvents = ({
  core,
  frames,
}: {
  core: Pick<
    AgentChatCore,
    | "tabId"
    | "onSessionBound"
    | "toasts"
    | "t"
    | "currentSessionIdRef"
    | "setCurrentSessionId"
    | "setMessages"
    | "setIsStreaming"
    | "setIsCompacting"
    | "setIsCompactingManual"
    | "setTodos"
    | "setCollaborationMode"
    | "setEffectiveMode"
    | "setQueuedCount"
    | "setQueuedMessages"
    | "setContextUsage"
    | "streamingRef"
    | "drainIncomingRef"
    | "prevQueueLengthRef"
    | "activeCompactionIdsRef"
  >
  frames: Pick<
    AgentChatFrames,
    | "updateToolStatus"
    | "patchToolCallBlocks"
    | "requestStreamFlush"
    | "discardPendingStreamUpdates"
    | "flushFrameRef"
    | "pendingMessageUpdateRef"
    | "pendingToolUpdatesRef"
  >
}) => {
  const { tabId, onSessionBound, toasts, t } = core
  const { success: successToast, warning: warningToast } = toasts
  const {
    currentSessionIdRef,
    setCurrentSessionId,
    setMessages,
    setIsStreaming,
    setIsCompacting,
    setIsCompactingManual,
    setTodos,
    setCollaborationMode,
    setEffectiveMode,
    setQueuedCount,
    setQueuedMessages,
    setContextUsage,
    streamingRef,
    drainIncomingRef,
    prevQueueLengthRef,
    activeCompactionIdsRef,
  } = core
  const {
    updateToolStatus,
    patchToolCallBlocks,
    requestStreamFlush,
    discardPendingStreamUpdates,
    flushFrameRef,
    pendingMessageUpdateRef,
    pendingToolUpdatesRef,
  } = frames

  // 分发 main 进程推送的 AgentEvent，支持基于 sessionId 与 tabId 的精准路由。
  const dispatchEvent = useCallback(
    (event: AgentEvent) => {
      const activeSessionId = currentSessionIdRef.current
      if (event.sessionId && activeSessionId && event.sessionId !== activeSessionId) {
        return
      }
      if (event.tabId && tabId && event.tabId !== tabId) {
        return
      }
      if (event.sessionId && !activeSessionId) {
        if (event.tabId === tabId || !event.tabId) {
          setCurrentSessionId(event.sessionId)
          if (tabId) {
            agentTabStore.setTabSessionId(tabId, event.sessionId)
          }
          onSessionBound?.(event.sessionId)
        } else {
          return
        }
      }

      switch (event.type) {
        case "agent_start":
          setIsStreaming(true)
          break

        case "agent_end":
          setIsStreaming(false)
          discardPendingStreamUpdates()
          streamingRef.current = null
          break

        case "message_start": {
          const message = event.message
          const streaming = message.role === "assistant" && message.stopReason === "pending"
          const item = toChatMessage(
            message,
            streaming,
            createChatMessageId(),
            currentSessionIdRef.current,
          )
          // 队列 drain 自动发送的消息：标记后供列表跳过"用户发送→滚动到底"（drain 前 queue_changed 已置位）。
          if (drainIncomingRef.current) {
            drainIncomingRef.current = false
            if (message.role === "user") item.isQueuedDrain = true
          }
          if (streaming) {
            // 新流式消息接管前先复位上一个流式条目的 loading 标记：
            // 防止上一条 AI 消息因 message_end 缺失/乱序而永久停留在 loading（操作按钮被 loader 遮盖）。
            const previous = streamingRef.current
            if (previous) {
              setMessages((prev) =>
                prev.map((current) =>
                  current.id === previous.id ? { ...current, isStreaming: false } : current,
                ),
              )
            }
            // 新流接管：撤销上一流尚未提交的挂起分片，避免其写入新条目。
            pendingMessageUpdateRef.current = null
            streamingRef.current = item
          }
          setMessages((prev) => [...prev, item])
          break
        }

        case "message_update": {
          if (!streamingRef.current) return
          // 只暂存最新完整分片，实际转换与提交延到下一帧（同一帧多次更新合并为一次）。
          pendingMessageUpdateRef.current = event.message
          requestStreamFlush()
          break
        }

        case "message_end": {
          const streaming = streamingRef.current
          if (!streaming) return
          // 仅助手消息的 message_end 与流式条目关联；用户/工具结果消息的 end（如 steer 即时插话）
          // 不会携带流式状态，直接忽略，避免用其内容覆盖正在流式的助手条目。
          if (event.message.role !== "assistant") return
          // 最终消息覆盖挂起分片的全部内容，丢弃未提交分片避免其回写旧内容。
          pendingMessageUpdateRef.current = null
          const final = toChatMessage(
            event.message,
            false,
            streaming.id,
            currentSessionIdRef.current,
          )
          streamingRef.current = null
          setMessages((prev) => prev.map((item) => (item.id === final.id ? final : item)))

          // 流式生成完毕，固化并注册设计卡片（isStreaming: false）。
          // 同一轮内的多个补丁按出现顺序链式累积：后一个补丁基于前一个结果，避免多区域修改互相覆盖。
          let chainBaseHtml: string | null = null
          let chainParentId: string | null = null

          final.blocks.forEach((block) => {
            if (block.kind === "frontDesign") {
              if (block.design.isUpdate) {
                const declaredParentId = block.design.parentId
                const targetSelector = block.design.target
                const parentDesign = declaredParentId
                  ? frontDesignStore.getDesign(declaredParentId)
                  : frontDesignStore.getActiveDesign()
                const baseHtml = chainBaseHtml ?? parentDesign?.html ?? null

                if (!baseHtml || !targetSelector) {
                  warningToast(
                    t("frontDesign.updateTargetNotFound", {
                      target: targetSelector || "unknown",
                    }),
                  )
                  return
                }

                const synthResult = synthesizeDesignUpdate(
                  baseHtml,
                  targetSelector,
                  block.design.html,
                  block.design.action,
                )

                if (!synthResult.ok || !synthResult.synthesizedHtml) {
                  warningToast(
                    t("frontDesign.updateTargetNotFound", {
                      target: targetSelector,
                    }),
                  )
                  return
                }

                frontDesignStore.registerDesign({
                  id: block.design.id,
                  parentId: chainParentId ?? parentDesign?.id ?? declaredParentId ?? null,
                  title:
                    block.design.title || `${parentDesign?.title || "Frontend Prototype"} (Update)`,
                  html: synthResult.synthesizedHtml,
                  isStreaming: false,
                  autoActivate: true,
                  sessionId: currentSessionIdRef.current,
                  updatedAt: final.timestamp,
                  mode: block.design.mode || parentDesign?.mode,
                  designDir: block.design.designDir,
                })
                chainBaseHtml = synthResult.synthesizedHtml
                chainParentId = block.design.id
                return
              }

              frontDesignStore.registerDesign({
                id: block.design.id,
                parentId: block.design.parentId,
                title: block.design.title,
                html: block.design.html,
                isStreaming: false,
                autoActivate: true,
                sessionId: currentSessionIdRef.current,
                updatedAt: final.timestamp,
                mode: block.design.mode,
                designDir: block.design.designDir,
              })
              chainBaseHtml = block.design.html
              chainParentId = block.design.id
            }
          })
          break
        }

        case "tool_execution_start":
          updateToolStatus(event.toolCallId, "running")
          break

        case "tool_execution_update": {
          // task 子代理流式回传：暂存每个 toolCallId 的最新快照，按帧合并提交（并行工具互不覆盖）。
          pendingToolUpdatesRef.current.set(event.toolCallId, event.partialResult)
          requestStreamFlush()
          break
        }

        case "tool_execution_end": {
          // 最终快照（含聚合 usage）随结果回传，覆盖流式期间的中间快照。
          pendingToolUpdatesRef.current.delete(event.toolCallId)
          const subagent = extractSubagentData(event.result)
          const subagents = extractSubagentsData(event.result)
          const answers = extractQuestionAnswers(event.result)
          patchToolCallBlocks(
            new Map([
              [
                event.toolCallId,
                {
                  status: event.isError ? ("error" as const) : ("done" as const),
                  // question 作答完成：清除挂起请求，块退回只读清单；答案随 block 回填。
                  ...(event.toolName === "question" ? { question: undefined } : {}),
                  ...(answers !== undefined ? { answers } : {}),
                  ...(subagent !== undefined ? { subagent } : {}),
                  ...(subagents !== undefined ? { subagents } : {}),
                },
              ],
            ]),
          )
          break
        }

        case "session_title":
          if (event.title === null) {
            if (!currentSessionIdRef.current) {
              setCurrentSessionId(event.sessionId)
              if (tabId) {
                agentTabStore.setTabSessionId(tabId, event.sessionId)
              }
            }
            sessionListStore.setSessionTitlePending(event.sessionId)
          } else {
            sessionListStore.updateSessionTitle(event.sessionId, event.title)
            if (tabId) {
              agentTabStore.setTabTitle(tabId, event.title)
            }
          }
          break

        case "model_switch": {
          const msg = event.message
          const item = toChatMessage(msg, false, createChatMessageId(), currentSessionIdRef.current)
          setMessages((prev) => upsertSwitchMessage(prev, item))
          break
        }

        case "compaction_summary": {
          // 上下文压缩完成：仅替换同一次压缩的 loading 占位，避免旧摘要或并行事件被误删。
          activeCompactionIdsRef.current.delete(event.compactionId)
          const stillCompacting = activeCompactionIdsRef.current.size > 0
          setIsCompacting(stillCompacting)
          if (!stillCompacting) setIsCompactingManual(false)
          const summary = {
            ...toChatMessage(
              event.message,
              false,
              createChatMessageId(),
              currentSessionIdRef.current,
            ),
            compactionId: event.compactionId,
          }
          setMessages((prev) => {
            const placeholderIndex = prev.findIndex(
              (message) => message.isCompacting && message.compactionId === event.compactionId,
            )
            if (placeholderIndex < 0) return [...prev, summary]
            return prev.map((message, index) => (index === placeholderIndex ? summary : message))
          })
          break
        }

        case "compaction_start": {
          // 上下文压缩开始（摘要生成耗时数秒）：在消息列表底部追加 loading 占位并禁止发送。
          activeCompactionIdsRef.current.add(event.compactionId)
          setIsCompacting(true)
          setIsCompactingManual(Boolean(event.manual))
          const placeholder: ChatMessage = {
            id: createChatMessageId(),
            role: "compactionSummary",
            blocks: [],
            isStreaming: false,
            isCompacting: true,
            compactionId: event.compactionId,
            isManual: event.manual,
            model: event.model,
          }
          setMessages((prev) => [...prev, placeholder])
          break
        }

        case "compaction_failed": {
          // 上下文压缩失败（摘要生成失败/超时）：仅移除对应 loading 占位并恢复发送。
          activeCompactionIdsRef.current.delete(event.compactionId)
          const stillCompacting = activeCompactionIdsRef.current.size > 0
          setIsCompacting(stillCompacting)
          if (!stillCompacting) setIsCompactingManual(false)
          setMessages((prev) =>
            prev.filter(
              (message) => !(message.isCompacting && message.compactionId === event.compactionId),
            ),
          )
          break
        }

        case "todo_updated":
          // 任务清单整表替换（模型经 todowrite 更新；驱动状态栏 todo 指示）。
          setTodos(event.todos)
          break

        case "collaboration_mode_changed":
          // 协作模式更新（基础模式 + auto 有效模式；驱动状态栏指示器并 Toast 提示用户）。
          setCollaborationMode(event.mode)
          setEffectiveMode(event.effectiveMode)
          if (event.message) {
            const item = toChatMessage(
              event.message,
              false,
              createChatMessageId(),
              currentSessionIdRef.current,
            )
            setMessages((prev) => upsertSwitchMessage(prev, item))
          }
          if (event.effectiveMode === "plan") {
            successToast(t("agent.collaborationModeSwitchedToPlan"))
          } else if (event.effectiveMode === "review") {
            successToast(t("agent.collaborationModeSwitchedToReview"))
          } else if (event.effectiveMode === "design") {
            successToast(t("agent.collaborationModeSwitchedToDesign"))
          } else if (event.mode === "auto") {
            successToast(t("agent.collaborationModeSwitchedToAuto"))
          } else if (event.mode === "minimal") {
            successToast(t("agent.collaborationModeSwitchedToMinimal"))
          } else {
            successToast(t("agent.collaborationModeSwitchedToBuild"))
          }
          break

        case "queue_changed":
          // 排队消息计数与内容（入队/出队/清空时 main 推送；stop 后归零自动复位）。
          setQueuedCount(event.length)
          setQueuedMessages(event.messages)
          // 计数递减 = 一条消息出队开始 drain：下一条 user 消息为自动发送，不触发"用户发送→滚动到底"。
          if (event.length < prevQueueLengthRef.current) {
            drainIncomingRef.current = true
          }
          prevQueueLengthRef.current = event.length
          break

        case "question_request":
          // 模型提问挂起：把请求回填到对应 question 工具调用块，驱动内联提问表单。
          patchToolCallBlocks(new Map([[event.request.toolCallId, { question: event.request }]]))
          break

        case "context_usage":
          // 上下文容量快照（agent_end / 压缩 / 删除 / 恢复后推送）。
          setContextUsage({ tokens: event.tokens, contextWindow: event.contextWindow })
          break

        default:
          break
      }
    },
    [
      updateToolStatus,
      patchToolCallBlocks,
      requestStreamFlush,
      discardPendingStreamUpdates,
      tabId,
      onSessionBound,
      successToast,
      warningToast,
      t,
    ],
  )

  // 挂载时订阅事件流；卸载时退订并取消挂起的流式提交帧。
  useEffect(() => {
    const unsubscribe = agentApi.onEvent(dispatchEvent)
    return () => {
      unsubscribe()
      if (flushFrameRef.current !== null) {
        cancelFrame(flushFrameRef.current)
        flushFrameRef.current = null
      }
    }
  }, [dispatchEvent])

  return { dispatchEvent }
}
