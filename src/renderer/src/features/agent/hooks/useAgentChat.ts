import type {
  AgentEvent,
  AgentSendContext,
  AgentSendOptions,
  CollaborationMode,
  QuestionAnswer,
  SubagentData,
  TodoList,
} from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { useTranslation } from "@/i18n"
import { agentApi } from "../api/agentApi"
import type { AgentInputFile } from "../components/AgentInput"
import type { ChatBlock, ChatMessage } from "../types"
import {
  extractQuestionAnswers,
  extractSubagentData,
  extractToolProgressText,
  parseQuestionAnswersFromText,
  toAgentMessages,
  toChatMessage,
} from "../utils"
import { agentTabStore } from "./agentTabStore"
import { sessionListStore } from "./sessionListStore"

// 展示条目 id 自增。
let messageSequence = 0

// 恢复会话时把 task 子代理快照与 question 答案（兜底）回填到对应 toolCall 块。
const mergeSubagentSnapshots = (chatMessages: ChatMessage[]): ChatMessage[] => {
  const subagentByToolCallId = new Map<string, SubagentData>()
  const answersByToolCallId = new Map<string, QuestionAnswer[]>()
  for (const message of chatMessages) {
    for (const block of message.blocks) {
      if (block.kind === "toolResult") {
        if (block.subagent) {
          subagentByToolCallId.set(block.toolCallId, block.subagent)
        }
        if (block.toolName === "question" && block.text) {
          const parsed = parseQuestionAnswersFromText(block.text)
          if (parsed) {
            answersByToolCallId.set(block.toolCallId, parsed)
          }
        }
      }
    }
  }
  if (subagentByToolCallId.size === 0 && answersByToolCallId.size === 0) return chatMessages
  return chatMessages.map((message) => ({
    ...message,
    blocks: message.blocks.map((block) => {
      if (block.kind === "toolCall") {
        const subagent = subagentByToolCallId.get(block.toolCallId)
        const fallbackAnswers = answersByToolCallId.get(block.toolCallId)
        return {
          ...block,
          ...(subagent ? { subagent } : {}),
          ...(!block.answers && fallbackAnswers ? { answers: fallbackAnswers } : {}),
        }
      }
      return block
    }),
  }))
}

/**
 * 管理 Agent 对话：订阅 main 进程事件流，驱动消息列表、流式更新与工具状态。
 * 历史会话的持久化与恢复均由 main 进程 DB 承载。支持多 Tab 实例隔离与精准事件路由。
 */
export const useAgentChat = (
  context?: AgentSendContext,
  tabId?: string,
  initialSessionId?: string | null,
  onSessionBound?: (sessionId: string) => void,
) => {
  const { success: successToast, error: errorToast } = useLxAgentToast()
  const { t } = useTranslation()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(initialSessionId ?? null)
  const currentSessionIdRef = useRef<string | null>(currentSessionId)
  currentSessionIdRef.current = currentSessionId
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputText, setInputText] = useState("")
  const [selectedFiles, setSelectedFiles] = useState<AgentInputFile[]>([])
  const [isStreaming, setIsStreaming] = useState(false)

  // 同步当前 Tab 的流式运行状态与对话轮数至 agentTabStore，供顶部 Tab 栏展示。
  useEffect(() => {
    if (tabId) {
      agentTabStore.setTabStreaming(tabId, isStreaming)
    }
    return () => {
      if (tabId) {
        agentTabStore.setTabStreaming(tabId, false)
      }
    }
  }, [tabId, isStreaming])

  useEffect(() => {
    if (tabId) {
      const userTurns = messages.filter((m) => m.role === "user").length
      agentTabStore.setTabTurnCount(tabId, userTurns)
    }
  }, [tabId, messages])

  // 排队消息计数（流式输出期间发送的消息；订阅 queue_changed 维护权威值）。
  const [queuedCount, setQueuedCount] = useState(0)
  // 排队消息原文（queue_changed 携带；输入区排队提示条 tooltip 展示）。
  const [queuedMessages, setQueuedMessages] = useState<string[]>([])
  // 历史会话恢复是否进行中（驱动消息列表骨架屏）。
  const [isRestoring, setIsRestoring] = useState(false)
  // 上下文压缩进行中（compaction_start/failed/summary 事件驱动；期间禁止发送消息）。
  const [isCompacting, setIsCompacting] = useState(false)
  // 上下文压缩是否为手动触发（/compact），驱动 UI 文案区分。
  const [isCompactingManual, setIsCompactingManual] = useState(false)
  // 任务清单（状态栏 todo 指示数据源：订阅 todo_updated / 恢复时提取；空数组 = 指示不渲染）。
  const [todos, setTodos] = useState<TodoList>([])
  // 当前协作模式（订阅 collaboration_mode_changed 事件同步；默认为 default）。
  const [collaborationMode, setCollaborationMode] = useState<CollaborationMode>("default")
  // 当前会话上下文容量（订阅 context_usage：估计 token / 压缩窗口，驱动状态栏百分比）。
  const [contextUsage, setContextUsage] = useState<{
    tokens: number
    contextWindow: number
  } | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  // 当前流式条目引用（message_update 定位）。
  const streamingRef = useRef<ChatMessage | null>(null)
  // 队列计数递减（一条消息出队）→ 下一条 user 消息即队列 drain 的自动发送（抑制滚动）。
  const drainIncomingRef = useRef(false)
  const prevQueueLengthRef = useRef(0)
  // 进行中的压缩事件集合：终态事件仅结束同 compactionId 的压缩，避免陈旧事件错误解锁输入。
  const activeCompactionIdsRef = useRef(new Set<string>())

  // 按 toolCallId 更新消息内工具块状态。
  const updateToolStatus = useCallback(
    (toolCallId: string, status: "running" | "done" | "error") => {
      setMessages((prev) =>
        prev.map((message) =>
          message.blocks.some(
            (block) => block.kind === "toolCall" && block.toolCallId === toolCallId,
          )
            ? {
                ...message,
                blocks: message.blocks.map((block) =>
                  block.kind === "toolCall" && block.toolCallId === toolCallId
                    ? { ...block, status }
                    : block,
                ),
              }
            : message,
        ),
      )
    },
    [],
  )

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
          streamingRef.current = null
          break

        case "message_start": {
          const message = event.message
          const streaming = message.role === "assistant" && message.stopReason === "pending"
          const item = toChatMessage(message, streaming, `m${++messageSequence}`)
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
            streamingRef.current = item
          }
          setMessages((prev) => [...prev, item])
          break
        }

        case "message_update": {
          const streaming = streamingRef.current
          if (!streaming) return
          const updated = toChatMessage(event.message, true, streaming.id)
          updated.isStreaming = true
          streamingRef.current = updated
          setMessages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
          break
        }

        case "message_end": {
          const streaming = streamingRef.current
          if (!streaming) return
          // 仅助手消息的 message_end 与流式条目关联；用户/工具结果消息的 end（如 steer 即时插话）
          // 不会携带流式状态，直接忽略，避免用其内容覆盖正在流式的助手条目。
          if (event.message.role !== "assistant") return
          const final = toChatMessage(event.message, false, streaming.id)
          streamingRef.current = null
          setMessages((prev) => prev.map((item) => (item.id === final.id ? final : item)))
          break
        }

        case "tool_execution_start":
          updateToolStatus(event.toolCallId, "running")
          break

        case "tool_execution_update": {
          // task 子代理流式回传：更新对应 toolCall 块的实时进度文本与面板快照。
          const progress = extractToolProgressText(event.partialResult)
          const subagent = extractSubagentData(event.partialResult)
          if (progress === undefined && subagent === undefined) break
          setMessages((prev) =>
            prev.map((message) => ({
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "toolCall" && block.toolCallId === event.toolCallId
                  ? {
                      ...block,
                      ...(progress !== undefined ? { progress } : {}),
                      ...(subagent !== undefined ? { subagent } : {}),
                    }
                  : block,
              ),
            })),
          )
          break
        }

        case "tool_execution_end": {
          // 最终快照（含聚合 usage）随结果回传，覆盖流式期间的中间快照。
          const subagent = extractSubagentData(event.result)
          const answers = extractQuestionAnswers(event.result)
          setMessages((prev) =>
            prev.map((message) => ({
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "toolCall" && block.toolCallId === event.toolCallId
                  ? {
                      ...block,
                      status: event.isError ? "error" : "done",
                      // question 作答完成：清除挂起请求，块退回只读清单；答案随 block 回填。
                      ...(event.toolName === "question" ? { question: undefined } : {}),
                      ...(answers !== undefined ? { answers } : {}),
                      ...(subagent !== undefined ? { subagent } : {}),
                    }
                  : block,
              ),
            })),
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
          const item = toChatMessage(event.message, false, `m${++messageSequence}`)
          setMessages((prev) => [...prev, item])
          break
        }

        case "compaction_summary": {
          // 上下文压缩完成：仅替换同一次压缩的 loading 占位，避免旧摘要或并行事件被误删。
          activeCompactionIdsRef.current.delete(event.compactionId)
          const stillCompacting = activeCompactionIdsRef.current.size > 0
          setIsCompacting(stillCompacting)
          if (!stillCompacting) setIsCompactingManual(false)
          const summary = {
            ...toChatMessage(event.message, false, `m${++messageSequence}`),
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
            id: `m${++messageSequence}`,
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
          // 协作模式更新（模型经 switch_mode 更新；驱动状态栏指示器并 Toast 提示用户）。
          setCollaborationMode(event.mode)
          if (event.mode === "plan") {
            successToast(t("agent.collaborationModeSwitchedToPlan"))
          } else {
            successToast(t("agent.collaborationModeSwitchedToDefault"))
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
          setMessages((prev) =>
            prev.map((message) => ({
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "toolCall" && block.toolCallId === event.request.toolCallId
                  ? { ...block, question: event.request }
                  : block,
              ),
            })),
          )
          break

        case "context_usage":
          // 上下文容量快照（agent_end / 压缩 / 删除 / 恢复后推送）。
          setContextUsage({ tokens: event.tokens, contextWindow: event.contextWindow })
          break

        default:
          break
      }
    },
    [updateToolStatus, tabId, onSessionBound, successToast, t],
  )

  // 挂载时订阅事件流；卸载时退订。
  useEffect(() => {
    const unsubscribe = agentApi.onEvent(dispatchEvent)
    return unsubscribe
  }, [dispatchEvent])

  // 停止流式生成：中止 main 侧 run（排队消息由 main 清空并推 queue_changed{0}，此处先本地归零）。
  const stopStreaming = useCallback(() => {
    void agentApi.abort(currentSessionIdRef.current ?? undefined, tabId)
    setIsStreaming(false)
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
  }, [tabId])

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

  // 删除一轮对话：移除该轮（问题 + 回答 + 工具调用）并同步 main 侧上下文与 DB。
  // 未命中 DB 用户消息 timestamp（幽灵消息）时仅做本地移除。
  const removeTurn = useCallback(
    (userIndex: number): void => {
      const list = messagesRef.current
      const userTimestamp = list[userIndex]?.timestamp
      let nextUserIndex = list.length
      for (let index = userIndex + 1; index < list.length; index++) {
        if (list[index].role === "user") {
          nextUserIndex = index
          break
        }
      }
      // 保留被移除范围内的压缩摘要（自动压缩不可随轮撤销消失；手动摘要由撤销压缩路径单独处理）。
      const keptSummaries = list
        .slice(userIndex, nextUserIndex)
        .filter((message) => message.role === "compactionSummary")
      const nextMessages = [
        ...list.slice(0, userIndex),
        ...keptSummaries,
        ...list.slice(nextUserIndex),
      ]
      setMessages(nextMessages)
      const sessionId = currentSessionIdRef.current
      void agentApi.restore(toAgentMessages(nextMessages), sessionId ?? undefined, tabId)
      if (sessionId && typeof userTimestamp === "number") {
        // 落库成功后再刷新列表，避免读到删除前的旧会话。
        void agentApi
          .deleteMessageTurn(sessionId, userTimestamp)
          .then(() => {
            void sessionListStore.refresh()
          })
          .catch(() => {
            // 写库失败为尽力而为：本地已移除，DB 仅多留一轮。
          })
      }

      // 检查剩余消息：若全空或只剩初始模型（isInitial: true），脱离当前会话
      const hasMeaningfulMessages = nextMessages.some(
        (m) => !(m.role === "modelSwitch" && m.isInitial),
      )
      if (!hasMeaningfulMessages) {
        setCurrentSessionId(null)
        if (tabId) {
          agentTabStore.setTabSessionId(tabId, null)
        }
        if (nextMessages.length > 0) {
          setMessages([])
          void agentApi.restore([], undefined, tabId)
        }
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

  // 撤销上一轮对话：删除最近一轮（含问题/回答/工具调用）并同步 main 侧与 DB。
  // 被撤销的用户消息回显到输入框，便于修改后重新发送。
  const undoLastTurn = useCallback(() => {
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
    const echoed = userMessage.blocks
      .filter((block): block is Extract<ChatBlock, { kind: "text" }> => block.kind === "text")
      .map((block) => block.text)
      .join("\n")
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

    removeTurn(lastUserIndex)
  }, [isStreaming, isCompacting, removeTurn, undoManualCompaction, errorToast, t])

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

  // 删除指定 AI 消息所在的一轮对话。
  const deleteTurn = useCallback(
    (aiMessageId: string) => {
      if (isStreaming) return
      const list = messagesRef.current
      const aiIndex = list.findIndex((message) => message.id === aiMessageId)
      if (aiIndex < 0) return
      const userIndex = list.findLastIndex(
        (message, index) => index < aiIndex && message.role === "user",
      )
      if (userIndex < 0) return
      removeTurn(userIndex)
    },
    [isStreaming, removeTurn],
  )

  // 恢复指定历史会话：从 main 进程 DB 读取并加载到上下文与展示。恢复期间展示骨架屏。
  const restoreChat = useCallback(
    (sessionId: string) => {
      stopStreaming()
      activeCompactionIdsRef.current.clear()
      setIsCompacting(false)
      setIsCompactingManual(false)
      setIsRestoring(true)
      setCurrentSessionId(sessionId)
      if (tabId) {
        agentTabStore.setTabSessionId(tabId, sessionId)
      }
      onSessionBound?.(sessionId)
      void agentApi
        .restoreSession(sessionId, tabId)
        .then((restored) => {
          const chatMessages = restored.messages.map((message) =>
            toChatMessage(message, false, `m${++messageSequence}`),
          )
          setMessages(mergeSubagentSnapshots(chatMessages))
          setTodos(restored.todos ?? [])
          setInputText("")
        })
        .catch(() => {
          // 会话已不存在等错误：保持当前展示，不做额外处理。
        })
        .finally(() => {
          setIsRestoring(false)
        })
    },
    [stopStreaming, tabId, onSessionBound],
  )

  // 发送消息：main 进程驱动 Agent 运行，消息由事件流回推渲染。
  // 流式输出期间发送 → main 侧入队（deferred queue）或即时插话（steer）；输入框立即清空。
  const sendMessage = useCallback(
    (contentToSend?: string, selection?: ModelSelection, options?: AgentSendOptions) => {
      let text = (contentToSend ?? inputText).trim()
      // 即时插话（steer）：统一剥离 /steer 前缀，气泡与模型只看到内容、不出现命令。
      if (options?.delivery === "steer" && text.startsWith("/steer")) {
        text = text.slice(6).trim()
      }
      if (!text && selectedFiles.length > 0) {
        text = `[发送了 ${selectedFiles.length} 个附件]`
      }
      if (!text) return
      // 上下文压缩中：禁止发送，避免与压缩/续跑竞态。
      if (isCompacting) {
        errorToast(
          isCompactingManual ? t("agent.compactingWaitManual") : t("agent.compactingWaitAuto"),
        )
        return
      }
      // 上下文 100%：拒绝发送（无法在溢出前压缩腾出空间，继续发送会超出模型窗口），提示新建对话。
      if (contextUsage && contextUsage.tokens >= contextUsage.contextWindow) {
        errorToast(t("agent.contextFullError"))
        return
      }

      const activeTab = tabId ? agentTabStore.getTabs().find((t) => t.id === tabId) : undefined
      const sessionBinding = activeTab?.draftBinding ?? sessionListStore.getCurrentSessionBinding()
      const sendContext: AgentSendContext = {
        ...context,
        tabId,
        sessionId: currentSessionIdRef.current ?? undefined,
        ...(sessionBinding?.cwd ? { cwd: sessionBinding.cwd } : {}),
        ...(sessionBinding?.projectId ? { projectId: sessionBinding.projectId } : {}),
        files: selectedFiles.map((file) => ({
          name: file.name,
          path: file.path,
          type: file.type,
          size: file.size,
          extension: file.extension,
        })),
      }

      setInputText("")
      setSelectedFiles([])

      void agentApi.send(text, selection, sendContext, options).then((result) => {
        if (result.ok) {
          if ("steered" in result) {
            successToast(t("agent.steerSentNotice"))
          }
          // 入队/插话消息处理于既有会话：仅真正新建/切换会话时更新会话 id 并刷新列表。
          if (result.sessionId && !("queued" in result) && !("steered" in result)) {
            setCurrentSessionId(result.sessionId)
            if (tabId) {
              agentTabStore.setTabSessionId(tabId, result.sessionId)
            }
            onSessionBound?.(result.sessionId)
            void sessionListStore.refresh()
          }
        } else if (contentToSend === undefined) {
          // 发送失败（如队列已满）：回显输入，便于修改后重发。
          setInputText(text)
          setSelectedFiles(
            sendContext.files ? sendContext.files.map((f, i) => ({ id: `err-${i}`, ...f })) : [],
          )
          errorToast(result.error)
        }
      })
    },
    [
      inputText,
      selectedFiles,
      context,
      contextUsage,
      errorToast,
      successToast,
      isCompacting,
      isCompactingManual,
      tabId,
      onSessionBound,
      t,
    ],
  )

  // "继续生成"可用性：最后一条助手消息被截断/中止且当前未在流式。
  const canContinue = useMemo(
    () =>
      !isStreaming &&
      messages.at(-1)?.role === "assistant" &&
      (messages.at(-1)?.stopReason === "length" || messages.at(-1)?.stopReason === "aborted"),
    [messages, isStreaming],
  )

  // 继续生成：续写被截断/中止的上一轮输出（续写指令由 main 注入为可见 user 气泡）。
  const continueChat = useCallback(() => {
    if (!canContinue) return
    const prompt = t("agent.continuePrompt")
    void agentApi
      .continue(prompt, currentSessionIdRef.current ?? undefined, tabId)
      .then((result) => {
        if (result.ok && result.sessionId) {
          setCurrentSessionId(result.sessionId)
          if (tabId) {
            agentTabStore.setTabSessionId(tabId, result.sessionId)
          }
          onSessionBound?.(result.sessionId)
          void sessionListStore.refresh()
        }
      })
  }, [canContinue, tabId, onSessionBound, t])

  // 编辑已发送的消息内容（仅影响显示，不改变 main 侧上下文）。
  const editMessage = useCallback((id: string, newContent: string) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? {
              ...message,
              blocks: message.blocks.map((block) =>
                block.kind === "text" ? { ...block, text: newContent } : block,
              ),
            }
          : message,
      ),
    )
  }, [])

  // 主动切换协作模式（default / plan 循环切换）。
  const toggleCollaborationMode = useCallback(() => {
    const nextMode: CollaborationMode = collaborationMode === "plan" ? "default" : "plan"
    void agentApi
      .setCollaborationMode(nextMode, currentSessionIdRef.current ?? undefined, tabId)
      .catch((err) => {
        console.error("Failed to set collaboration mode:", err)
      })
  }, [collaborationMode, tabId])

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

  // 检查当前是否仅剩最后一轮用户对话（用于 /undo 二次确认判定）。
  const isOnlyOneTurnLeft = useCallback((): boolean => {
    const list = messagesRef.current
    const userTurnCount = list.filter((m) => m.role === "user").length
    return userTurnCount === 1
  }, [])

  return {
    messages,
    todos,
    collaborationMode,
    toggleCollaborationMode,
    queuedCount,
    queuedMessages,
    contextUsage,
    inputText,
    setInputText,
    selectedFiles,
    setSelectedFiles,
    isStreaming,
    isCompacting,
    isCompactingManual,
    isRestoring,
    sendMessage,
    continueChat,
    canContinue,
    stopStreaming,
    createNewChat,
    undoLastTurn,
    isOnlyOneTurnLeft,
    compactChat,
    deleteTurn,
    restoreChat,
    editMessage,
    refreshContextUsage,
    currentSessionId,
  }
}
