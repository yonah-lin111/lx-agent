import type { AgentSendContext, AgentSendOptions } from "@shared/contracts/agent"
import type { ModelSelection } from "@shared/settings"
import { useCallback, useMemo } from "react"
import { agentApi } from "@/features/agent/api/agentApi"
import { agentTabStore } from "@/features/agent/hooks/agentTabStore"
import { frontDesignStore } from "@/features/agent/hooks/frontDesignStore"
import { sessionListStore } from "@/features/agent/hooks/sessionListStore"
import type { AgentChatCore } from "@/features/agent/hooks/useAgentChat.types"
import { cleanUserPrompt } from "@/features/agent/utils"
import { buildDesignReferenceBlocks } from "@/features/agent/utils/designReferenceInjection"
import { extractClawMentions, stripClawMention } from "@/features/openclaw/clawMention"
import { useOpenClawOfficeStore } from "@/features/openclaw/openclawOfficeStore"
import { navigateTo } from "@/lib/navigate"
import { PAGE_ROUTES } from "@/lib/pageRoutes"

/**
 * 发送域：发送消息、续写被截断输出、编辑已发送内容。
 */
export const useAgentChatSend = ({
  core,
}: {
  core: Pick<
    AgentChatCore,
    | "inputText"
    | "selectedFiles"
    | "context"
    | "contextUsage"
    | "isStreaming"
    | "isCompacting"
    | "isCompactingManual"
    | "collaborationMode"
    | "tabId"
    | "onSessionBound"
    | "toasts"
    | "t"
    | "messages"
    | "messagesRef"
    | "currentSessionIdRef"
    | "setInputText"
    | "setSelectedFiles"
    | "setMessages"
    | "setCurrentSessionId"
  >
}) => {
  const { inputText, selectedFiles, context, contextUsage, isCompacting, isCompactingManual } = core
  const { tabId, onSessionBound, t, collaborationMode } = core
  const { error: errorToast, success: successToast } = core.toasts
  const { isStreaming, messages, currentSessionIdRef } = core
  const { setInputText, setSelectedFiles, setMessages, setCurrentSessionId } = core

  // 发送消息：main 进程驱动 Agent 运行，消息由事件流回推渲染。
  // 流式输出期间发送 → main 侧入队（deferred queue）或即时插话（steer）；输入框立即清空。
  const sendMessage = useCallback(
    (contentToSend?: string, selection?: ModelSelection, options?: AgentSendOptions) => {
      let text = (contentToSend ?? inputText).trim()
      // 即时插话（steer）：统一剥离 /steer 前缀，气泡与模型只看到内容、不出现命令，并提取 [] 占位符内的文字。
      if (options?.delivery === "steer" || text.startsWith("/steer ") || text === "/steer") {
        if (text.startsWith("/steer")) {
          text = text.slice(6).trim()
        }
        text = text.replace(/^[\[【]([\s\S]*?)[\]】]$/, "$1").trim()
      }
      if (!text && selectedFiles.length > 0) {
        text = `[发送了 ${selectedFiles.length} 个附件]`
      }
      if (!text) return

      // 拦截 @claw:<instanceId>/<agentId> 委派：跳转 OpenClaw 页面并定位目标，本地 Agent 不参与、主对话不留痕。
      const clawMentions = extractClawMentions(text)
      if (clawMentions.length > 0) {
        const [mention] = clawMentions
        const task = stripClawMention(text, mention)
        if (!task) {
          errorToast(t("agent.clawTaskRequired"))
          return
        }
        setInputText("")
        setSelectedFiles([])
        // 页面消费 pendingDispatch 后负责连接与发送，避免在本地 Agent 侧持有 OpenClaw 会话生命周期。
        useOpenClawOfficeStore.getState().requestDispatch({
          instanceId: mention.instanceId,
          agentId: mention.agentId,
          task,
        })
        navigateTo(PAGE_ROUTES.openclaw)
        return
      }

      // 注入设计上下文：显式 @design:{id}#selector 引用优先，design 模式下无引用时以画布激活设计为默认修改基线。
      const designBlocks = buildDesignReferenceBlocks(text, {
        collaborationMode,
        currentSessionId: currentSessionIdRef.current,
        activeDesign: frontDesignStore.getActiveDesign(),
        resolveDesign: (id) => frontDesignStore.getDesign(id),
      })
      if (designBlocks.length > 0) {
        text = `${designBlocks.join("\n\n")}\n\n${text}`
      }
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
        } else {
          // 发送失败（如队列已满）：始终 toast 提示（卡片采纳等携带内容的发送失败不得静默）；
          // 用户手输的消息额外回显输入，便于修改后重发。
          if (contentToSend === undefined) {
            setInputText(cleanUserPrompt(text))
            setSelectedFiles(
              sendContext.files ? sendContext.files.map((f, i) => ({ id: `err-${i}`, ...f })) : [],
            )
          }
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
      collaborationMode,
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

  return { sendMessage, canContinue, continueChat, editMessage }
}
