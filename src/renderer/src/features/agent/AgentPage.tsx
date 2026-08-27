import type {
  AgentSendContext,
  PermissionRequest,
  SandboxPolicy,
  SuggestedQuestionContextMessage,
} from "@shared/contracts/agent"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { useLxAgentToast } from "@/components/ui/LxToast"
import { buildGitWorktreeOptions, getGitWorktreeDirName, useGitWorktrees } from "@/features/git"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { subscribeSettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"
import { agentApi } from "./api/agentApi"
import {
  AgentExecutionFlowList,
  type AgentExecutionFlowListRef,
} from "./components/AgentExecutionFlowList"
import { AgentInput } from "./components/AgentInput"
import { AgentMessageList, type AgentMessageListRef } from "./components/AgentMessageList"
import { AgentSubagentPanel } from "./components/panels"
import { AgentStatusBar } from "./components/status-bar"
import { agentViewStore } from "./hooks/agentViewStore"
import { sessionListStore } from "./hooks/sessionListStore"
import { useAgentChat } from "./hooks/useAgentChat"
import { useAgentJobs } from "./hooks/useAgentJobs"
import { useAgentModelSelect } from "./hooks/useAgentModelSelect"
import type { ChatBlock } from "./types"

// 子代理调用块类型（点击 label 打开面板弹窗）。
type SubagentToolCall = Extract<ChatBlock, { kind: "toolCall" }>

export interface AgentPageProps {
  onNewChatRef?: (fn: () => void) => void
  onRestoreChatRef?: (fn: (sessionId: string) => void) => void
  onToggleExecutionFlowRef?: (fn: () => void) => void
  context?: AgentSendContext
  currentProjectId?: string
  currentProjectPath?: string
}

/**
 * Agent 独立页面与对话集成组件。
 */
export const AgentPage = ({
  onNewChatRef,
  onRestoreChatRef,
  onToggleExecutionFlowRef,
  context,
  currentProjectId,
  currentProjectPath,
}: AgentPageProps): React.JSX.Element => {
  const {
    messages,
    todos,
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
    compactChat,
    deleteTurn,
    restoreChat,
    editMessage,
    refreshContextUsage,
  } = useAgentChat(context)

  const { jobs } = useAgentJobs()

  const {
    selectedModel,
    selectedSelection,
    hasModelOptions,
    selectOptions,
    handleModelChange,
    suggestedQuestionsEnabled,
    settings,
  } = useAgentModelSelect()

  const supportsImages = useMemo(() => {
    if (!selectedSelection) return false
    const modelId = selectedSelection.model.toLowerCase()

    // 如果 settings 存在，并且对应的模型配置存在，优先使用 modalities.input 进行校验
    const modelConfig =
      settings?.providers[selectedSelection.provider]?.models?.[selectedSelection.model]
    if (modelConfig?.modalities?.input) {
      return modelConfig.modalities.input.includes("image")
    }

    // 兜底智能判定：支持多模态的常见模型前缀/名字关键字
    return modelId.includes("gpt-4o") || modelId.includes("claude-3") || modelId.includes("gemini")
  }, [settings, selectedSelection])

  // 模型切换后立即刷新状态栏上下文窗口（不必等下一 turn 的 context_usage 推送；无会话时保持不显示）。
  useEffect(() => {
    refreshContextUsage(selectedSelection)
  }, [selectedSelection, refreshContextUsage])

  const [currentSandboxPolicy, setCurrentSandboxPolicy] =
    useState<SandboxPolicy>("workspace-write")

  const loadPermissionSettings = useCallback(() => {
    void settingsApi.getPermissionSettings().then((settings) => {
      if (settings?.sandboxPolicy) {
        setCurrentSandboxPolicy(settings.sandboxPolicy)
      }
    })
  }, [])

  useEffect(() => {
    loadPermissionSettings()
    return subscribeSettingsChanged("permissions", loadPermissionSettings)
  }, [loadPermissionSettings])

  // 配置变更（设置页保存）后刷新状态栏上下文窗口，无需刷新页面。
  const selectedSelectionRef = useRef(selectedSelection)
  selectedSelectionRef.current = selectedSelection

  useEffect(() => {
    const refresh = (): void => refreshContextUsage(selectedSelectionRef.current)
    return subscribeSettingsChanged("models", refresh)
  }, [refreshContextUsage])

  const [defaultPath, setDefaultPath] = useState<string>("")

  useEffect(() => {
    void agentApi.getDefaultPath().then((path) => {
      setDefaultPath(path)
    })
  }, [])

  const currentSessionBinding = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getCurrentSessionBinding,
  )
  const currentSessionId = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getCurrentSessionId,
  )
  const currentSessionPath = currentSessionBinding?.cwd

  // 当处于草稿态（未入库）且页面/项目发生切换时：
  // 1. 如果草稿尚未绑定任何项目路径，或者当前草稿路径就是默认桌面路径（未被显式设置项目），则跟随当前页面/项目路径同步；
  // 2. 如果新 session 已经明确有了项目路径（例如用户在状态栏选择过或已带入项目），切换页面时不强制回退到默认桌面。
  useEffect(() => {
    if (!currentSessionId) {
      if (currentProjectPath) {
        // 当前全局切换到了具体项目，草稿同步切换到目标项目
        sessionListStore.setDraftBinding({
          projectId: currentProjectId,
          cwd: currentProjectPath,
        })
      } else {
        // 全局无项目（例如在桌面/非项目页面）：若草稿尚未设置任何路径，才兜底为默认桌面路径
        const existingDraft = sessionListStore.getCurrentSessionBinding()
        if (!existingDraft?.cwd && defaultPath) {
          sessionListStore.setDraftBinding({
            projectId: undefined,
            cwd: defaultPath,
          })
        }
      }
    }
  }, [currentSessionId, currentProjectId, currentProjectPath, defaultPath])

  // 会话路径绑定：
  // 1. 已落库会话：使用会话绑定的 cwd
  // 2. 草稿新会话：使用 draftBinding.cwd（若未手动指定则直接使用当前页面项目路径或默认桌面）
  const effectiveProjectPath = currentSessionBinding?.cwd ?? (currentProjectPath || defaultPath)
  const effectiveProjectId =
    currentSessionBinding !== undefined ? currentSessionBinding.projectId : currentProjectId
  const statusBarPath = effectiveProjectPath

  // git 工作区列表（/gitWorktree 二级面板数据源；当前会话 cwd 即工作区绑定）。
  const { worktrees, projectBranch } = useGitWorktrees(effectiveProjectPath)
  const worktreeOptions = useMemo(() => {
    if (!effectiveProjectPath || worktrees == null) return null
    return buildGitWorktreeOptions({
      worktrees,
      projectPath: effectiveProjectPath,
      projectBranch,
      worktreePath: currentSessionPath,
    })
  }, [worktrees, projectBranch, effectiveProjectPath, currentSessionPath])

  // 计算当前会话是否处于非主工作区中（供 @ 文件面板等展示工作区 tag）
  const activeWorktreeName = useMemo(() => {
    if (!effectiveProjectPath || !worktrees) return undefined
    const currentEntry = worktrees.find((wt) => wt.path === effectiveProjectPath)
    if (currentEntry && !currentEntry.isDefault) {
      return currentEntry.branch ?? getGitWorktreeDirName(currentEntry.path)
    }
    return undefined
  }, [effectiveProjectPath, worktrees])

  const { success, error, warning } = useLxAgentToast()
  const { t } = useTranslation()

  // 切换模型：同步更新本地选择；若处于已有会话中，立即落库 model_change entry
  const handleModelSelectChange = useCallback(
    (value: string) => {
      handleModelChange(value)
      const [provider, model] = value.split("::")
      if (provider && model && currentSessionId) {
        void agentApi.switchModel({ provider, model }).catch((err) => {
          console.error("Failed to switch model in session:", err)
        })
      }
    },
    [handleModelChange, currentSessionId],
  )

  // 停止生成：排队消息被丢弃，toast 提示条数（main 侧 abort 时清空队列）。
  const handleStop = useCallback(() => {
    if (queuedCount > 0) {
      success(t("agent.droppedQueuedMessages", { count: queuedCount }))
    }
    stopStreaming()
  }, [queuedCount, stopStreaming, success, t])

  // 挂起的权限请求：订阅事件流，驱动状态栏权限 icon tooltip（替代原弹窗）。
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null)

  useEffect(() => {
    const unsubscribe = agentApi.onEvent((event) => {
      if (event.type === "permission_request") {
        setPendingRequest(event.request)
      } else if (event.type === "agent_end") {
        setPendingRequest(null)
      }
    })
    return unsubscribe
  }, [])

  // 权限决策：回传 main；允许全部由 main 侧记录为会话级放行；永久允许/拒绝写回配置。
  const respondPermission = useCallback(
    (
      decision: "allow" | "deny",
      rememberForSession?: boolean,
      allowAll?: boolean,
      permanent?: boolean,
    ): void => {
      const current = pendingRequest
      if (!current) return
      setPendingRequest(null)
      void agentApi.permissionRespond({
        requestId: current.requestId,
        decision,
        rememberForSession,
        allowAll,
        permanent,
      })
    },
    [pendingRequest],
  )

  // 当前打开的子代理面板 toolCallId（点击 AgentSubagentBlock 顶部 label 触发；从头部下方覆盖消息列表展开）。
  const [activeSubagentId, setActiveSubagentId] = useState<string | null>(null)

  // 实时从 messages 中解析最新的 subagent toolCall 块，确保子代理流式更新能够被面板响应
  const activeSubagent = useMemo<SubagentToolCall | null>(() => {
    if (!activeSubagentId) return null
    for (const message of messages) {
      for (const block of message.blocks) {
        if (block.kind === "toolCall" && block.toolCallId === activeSubagentId) {
          return block
        }
      }
    }
    return null
  }, [messages, activeSubagentId])
  // 当前视图模式：qa 为消息列表，flow 为执行流程视图；两者互斥并持久化，输出中禁止切换。
  const viewMode = useSyncExternalStore(agentViewStore.subscribe, agentViewStore.getViewMode)

  // 同步当前生成状态到视图模式 store，供全局切换守卫拦截。
  useEffect(() => {
    agentViewStore.setIsGenerating(isStreaming)
  }, [isStreaming])

  const toggleExecutionFlow = useCallback((): void => {
    const ok = agentViewStore.toggleViewMode()
    if (!ok) {
      warning(t("agent.viewSwitchBlocked"))
    } else {
      setActiveSubagentId(null)
    }
  }, [warning, t])

  const openSubagent = useCallback((toolCall: SubagentToolCall): void => {
    setActiveSubagentId(toolCall.toolCallId)
  }, [])
  // 子代理面板消息列表滚动容器（面板打开时，滚动按钮接管面板滚动）。
  const subagentScrollRef = useRef<HTMLDivElement>(null)
  const messageListRef = useRef<AgentMessageListRef>(null)
  // 执行流程列表命令式句柄（flow 视图下输入区回到底部按钮的目标）。
  const flowListRef = useRef<AgentExecutionFlowListRef>(null)
  const [navState, setNavState] = useState({
    canScrollBottom: false,
  })
  // 切换视图时重置导航状态，等待当前视图挂载后重新上报。
  useEffect(() => {
    setNavState({ canScrollBottom: false })
  }, [viewMode])
  // 全局 Esc 停止生成的连按计时（间隔 ≤1s 视为双击；单按仅 toast 提示）。
  const escStopRef = useRef(0)

  // 全局 Esc 快捷键：双击 Esc 才停止生成（首按 toast 提示），避免误触打断。
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return
      // 若处于子代理面板打开状态，让子代理面板优先关闭
      if (activeSubagentId !== null) {
        setActiveSubagentId(null)
        return
      }
      if (!isStreaming) return
      // 若有权限面板弹层，不全局截获
      if (pendingRequest !== null) return
      // 若当前焦点在 textarea/input 内，由局部 keydown 处理
      const activeEl = document.activeElement
      if (activeEl instanceof HTMLTextAreaElement || activeEl instanceof HTMLInputElement) {
        return
      }
      e.preventDefault()
      const now = Date.now()
      if (escStopRef.current !== 0 && now - escStopRef.current <= 1000) {
        escStopRef.current = 0
        handleStop()
      } else {
        escStopRef.current = now
        warning(t("agent.pressEscAgainToStop"))
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown)
    }
  }, [isStreaming, activeSubagent, pendingRequest, handleStop, warning, t])

  // 切换会话工作区：更新会话 cwd 后刷新会话列表（状态栏路径与面板高亮同步）。
  const handleWorktreeSelect = useCallback(
    (path: string, silent = false): void => {
      const sessionId = sessionListStore.getCurrentSessionId()
      if (!sessionId) {
        const currentBinding = sessionListStore.getCurrentSessionBinding()
        sessionListStore.setDraftBinding({
          ...currentBinding,
          cwd: path,
        })
      }
      void agentApi.switchWorktree(path).then((result) => {
        if (result.ok) {
          if (!silent) {
            success(t("agent.worktreeSwitched"))
          }
          if (sessionId) {
            void sessionListStore.refresh()
          }
        } else {
          error(result.error)
        }
      })
    },
    [success, error, t],
  )

  // 检测当前工作区路径是否存在；若已被外部删除则自动静默回退至默认主工作区
  useEffect(() => {
    if (!worktrees || worktrees.length === 0 || !effectiveProjectPath) return
    const defaultEntry = worktrees.find((wt) => wt.isDefault)
    if (!defaultEntry) return

    // 检查当前有效路径是否在当前仓库的工作区列表中
    const existsInWorktrees = worktrees.some((wt) => wt.path === effectiveProjectPath)
    if (!existsInWorktrees && effectiveProjectPath !== defaultEntry.path) {
      handleWorktreeSelect(defaultEntry.path, true)
    }
  }, [worktrees, effectiveProjectPath, handleWorktreeSelect])

  // 切换会话项目：更新会话 project_id 与 cwd 后刷新会话列表。
  const handleProjectSelect = useCallback(
    (projectId: string, path: string): void => {
      const sessionId = sessionListStore.getCurrentSessionId()
      if (!sessionId) {
        sessionListStore.setDraftBinding({
          projectId,
          cwd: path,
        })
      }
      void agentApi.switchProject(projectId, path).then((result) => {
        if (result.ok) {
          success(t("agent.projectSwitched"))
          if (sessionId) {
            void sessionListStore.refresh()
          }
        } else {
          error(result.error)
        }
      })
    },
    [success, error, t],
  )

  // 会话分支：从指定用户轮切割复制历史到新会话，创建后自动切换（输入框留空直接重写）。
  const handleFork = useCallback(
    (userMessageTimestamp: number): void => {
      const sessionId = sessionListStore.getCurrentSessionId()
      if (!sessionId) return
      void agentApi.forkSession(sessionId, userMessageTimestamp).then((result) => {
        if (result.ok) {
          success(t("agent.forkSessionCreated"))
          void sessionListStore.refresh()
          restoreChat(result.sessionId)
        } else {
          error(result.error)
        }
      })
    },
    [success, error, restoreChat, t],
  )

  // 建议问题输入框聚焦引用（回显后定位光标）。
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 生成建议问题所需的完整会话上下文（跳过工具结果，仅用户与助手文本）。
  const suggestedQuestionContext = useMemo<SuggestedQuestionContextMessage[]>(() => {
    // 设置中停用推荐问题时直接返回空：不构建上下文，也不触发生成请求与加载占位。
    if (!suggestedQuestionsEnabled) return []
    const result: SuggestedQuestionContextMessage[] = []
    for (const message of messages) {
      if (message.role !== "user" && message.role !== "assistant") continue
      const content = message.blocks
        .filter((block): block is Extract<ChatBlock, { kind: "text" }> => block.kind === "text")
        .map((block) => block.text)
        .join("\n")
      if (content.trim()) result.push({ role: message.role, content })
    }
    return result
  }, [messages, suggestedQuestionsEnabled])

  // 回显建议问题到输入框：覆盖内容、光标聚焦末尾。
  const echoToInput = useCallback(
    (question: string): void => {
      setInputText(question)
      requestAnimationFrame(() => {
        const textarea = inputTextareaRef.current
        if (textarea) {
          textarea.focus()
          textarea.setSelectionRange(textarea.value.length, textarea.value.length)
        }
      })
    },
    [setInputText],
  )

  const handleNewChat = useCallback(() => {
    createNewChat()
    const initialCwd = currentProjectPath || defaultPath
    if (initialCwd) {
      sessionListStore.setDraftBinding({
        projectId: currentProjectId,
        cwd: initialCwd,
      })
    }
  }, [createNewChat, currentProjectId, currentProjectPath, defaultPath])

  const handleRestoreChat = useCallback(
    (sessionId: string) => {
      restoreChat(sessionId)
    },
    [restoreChat],
  )

  if (onNewChatRef) {
    onNewChatRef(handleNewChat)
  }
  if (onRestoreChatRef) {
    onRestoreChatRef(handleRestoreChat)
  }
  if (onToggleExecutionFlowRef) {
    onToggleExecutionFlowRef(toggleExecutionFlow)
  }

  return (
    <div
      className={`agent-page-container relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent ${
        pendingRequest ? "permission-pending" : ""
      }`}
    >
      {/* 视图容器：问答消息列表与执行流程视图互斥显示；子代理面板从容器顶部向下展开、恰好覆盖消息列表。 */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {viewMode === "flow" ? (
          /* 执行流程视图：消息列表的另一种显示形式，展示当前 Agent 的全部执行日志与步骤。 */
          <AgentExecutionFlowList
            ref={flowListRef}
            messages={messages}
            isStreaming={isStreaming}
            sessionId={currentSessionId ?? undefined}
            cwd={statusBarPath}
            onSelectPrompt={(prompt) => sendMessage(prompt)}
            onNavigationStateChange={setNavState}
            canContinue={canContinue}
            onContinue={continueChat}
          />
        ) : (
          <>
            <AgentMessageList
              ref={messageListRef}
              messages={messages}
              isStreaming={isStreaming}
              isRestoring={isRestoring}
              suggestedQuestionContext={suggestedQuestionContext}
              onSendSuggestedQuestion={(question) => sendMessage(question, selectedSelection)}
              onEchoToInput={echoToInput}
              onSelectPrompt={(prompt) => sendMessage(prompt)}
              onEditMessage={editMessage}
              onDeleteMessage={deleteTurn}
              onOpenSubagent={openSubagent}
              onFork={handleFork}
              isSubagentPanelOpen={activeSubagentId !== null}
              subagentScrollRef={activeSubagentId !== null ? subagentScrollRef : undefined}
              canContinue={canContinue}
              onContinue={continueChat}
              onNavigationStateChange={setNavState}
            />
            {/* 子代理面板：点击 AgentSubagentBlock 顶部 label 展开，只读展示内部运行记录。 */}
            <AgentSubagentPanel
              toolCall={activeSubagent}
              onClose={() => setActiveSubagentId(null)}
              scrollRef={subagentScrollRef}
            />
          </>
        )}
      </div>
      {/* 任务清单由 AgentStatusBar 右侧 todo 指示展示（有未完成任务时显示，hover 查看列表）。 */}
      <AgentInput
        inputText={inputText}
        isStreaming={isStreaming}
        isCompacting={isCompacting}
        isCompactingManual={isCompactingManual}
        queuedCount={queuedCount}
        queuedMessages={queuedMessages}
        onInputChange={setInputText}
        onSend={(options) => sendMessage(undefined, selectedSelection, options)}
        onStop={handleStop}
        onClear={handleNewChat}
        onUndo={undoLastTurn}
        onCompact={compactChat}
        selectedModel={selectedModel}
        onModelChange={handleModelSelectChange}
        modelOptions={selectOptions}
        hasModelOptions={hasModelOptions}
        projectId={effectiveProjectId}
        projectPath={effectiveProjectPath}
        currentPath={statusBarPath}
        worktreeName={activeWorktreeName}
        inputTextareaRef={inputTextareaRef}
        worktreeOptions={worktreeOptions}
        onWorktreeSelect={handleWorktreeSelect}
        selectedFiles={selectedFiles}
        onFilesChange={setSelectedFiles}
        supportsImages={supportsImages}
        onScrollBottom={() =>
          viewMode === "flow"
            ? flowListRef.current?.scrollToBottom()
            : messageListRef.current?.scrollToBottom()
        }
        canScrollBottom={navState.canScrollBottom}
      />
      <AgentStatusBar
        projectPath={statusBarPath}
        projectId={effectiveProjectId}
        onProjectChange={handleProjectSelect}
        onWorktreeChange={handleWorktreeSelect}
        contextUsage={contextUsage}
        todos={todos}
        jobs={jobs}
        onOpenJobs={() => useBottomSideBarStore.getState().openJobsMonitor()}
        sandboxPolicy={currentSandboxPolicy}
        pendingRequest={pendingRequest}
        onPermissionRespond={respondPermission}
      />
    </div>
  )
}
