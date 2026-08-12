import type {
  AgentSendContext,
  PermissionRequest,
  SuggestedQuestionContextMessage,
} from "@shared/contracts/agent"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { buildGitWorktreeOptions, useGitWorktrees } from "@/features/git"
import { agentApi } from "./api/agentApi"
import { AgentInput } from "./components/AgentInput"
import { AgentMessageList } from "./components/AgentMessageList"
import { AgentStatusBar } from "./components/AgentStatusBar"
import { AgentSubagentPanel } from "./components/AgentSubagentPanel"
import { sessionListStore } from "./hooks/sessionListStore"
import { useAgentChat } from "./hooks/useAgentChat"
import { useAgentModelSelect } from "./hooks/useAgentModelSelect"
import type { ChatBlock } from "./types"

// 子代理调用块类型（点击 label 打开面板弹窗）。
type SubagentToolCall = Extract<ChatBlock, { kind: "toolCall" }>

export interface AgentPageProps {
  onNewChatRef?: (fn: () => void) => void
  onRestoreChatRef?: (fn: (sessionId: string) => void) => void
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
  context,
  currentProjectId,
  currentProjectPath,
}: AgentPageProps): React.JSX.Element => {
  const {
    messages,
    inputText,
    setInputText,
    isStreaming,
    isRestoring,
    sendMessage,
    continueChat,
    canContinue,
    stopStreaming,
    createNewChat,
    undoLastTurn,
    deleteTurn,
    restoreChat,
    editMessage,
  } = useAgentChat(context)

  const { selectedModel, selectedSelection, hasModelOptions, selectOptions, handleModelChange } =
    useAgentModelSelect()
  const currentSessionPath = useSyncExternalStore(
    sessionListStore.subscribe,
    sessionListStore.getCurrentSessionPath,
  )
  const statusBarPath = currentSessionPath ?? currentProjectPath

  // git 工作区列表（/gitWorktree 二级面板数据源；当前会话 cwd 即工作区绑定）。
  const { worktrees, projectBranch } = useGitWorktrees(currentProjectPath)
  const worktreeOptions = useMemo(() => {
    if (!currentProjectPath || worktrees == null) return null
    return buildGitWorktreeOptions({
      worktrees,
      projectPath: currentProjectPath,
      projectBranch,
      worktreePath: currentSessionPath,
    })
  }, [worktrees, projectBranch, currentProjectPath, currentSessionPath])

  const { success, error } = useLxToast()

  // 切换会话工作区：更新会话 cwd 后刷新会话列表（状态栏路径与面板高亮同步）。
  const handleWorktreeSelect = useCallback(
    (path: string): void => {
      void agentApi.switchWorktree(path).then((result) => {
        if (result.ok) {
          success("已切换工作区")
          void sessionListStore.refresh()
        } else {
          error(result.error)
        }
      })
    },
    [success, error],
  )

  // 建议问题输入框聚焦引用（回显后定位光标）。
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null)

  // 生成建议问题所需的完整会话上下文（跳过工具结果，仅用户与助手文本）。
  const suggestedQuestionContext = useMemo<SuggestedQuestionContextMessage[]>(() => {
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
  }, [messages])

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

  // 挂起的权限请求：订阅事件流，驱动 AgentInput 命令面板（替代原弹窗）。
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

  // 权限决策：回传 main；允许全部由 main 侧记录为会话级放行。
  const respondPermission = useCallback(
    (decision: "allow" | "deny", rememberForSession?: boolean, allowAll?: boolean): void => {
      const current = pendingRequest
      if (!current) return
      setPendingRequest(null)
      void agentApi.permissionRespond({
        requestId: current.requestId,
        decision,
        rememberForSession,
        allowAll,
      })
    },
    [pendingRequest],
  )

  // 当前打开的子代理面板（点击 AgentSubagentBlock 顶部 label 触发；从头部下方覆盖消息列表展开）。
  const [activeSubagent, setActiveSubagent] = useState<SubagentToolCall | null>(null)
  const openSubagent = useCallback((toolCall: SubagentToolCall): void => {
    setActiveSubagent(toolCall)
  }, [])
  // 子代理面板消息列表滚动容器（面板打开时，滚动按钮接管面板滚动）。
  const subagentScrollRef = useRef<HTMLDivElement>(null)

  if (onNewChatRef) {
    onNewChatRef(createNewChat)
  }
  if (onRestoreChatRef) {
    onRestoreChatRef(restoreChat)
  }

  return (
    <div
      className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-transparent ${
        pendingRequest ? "permission-pending" : ""
      }`}
    >
      {/* 消息列表容器：子代理面板从容器顶部向下展开、恰好覆盖消息列表（列表保持挂载不隐藏）。 */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AgentMessageList
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
          isSubagentPanelOpen={activeSubagent !== null}
          subagentScrollRef={subagentScrollRef}
          canContinue={canContinue}
          onContinue={continueChat}
        />
        {/* 子代理面板：点击 AgentSubagentBlock 顶部 label 展开，只读展示内部运行记录。 */}
        <AgentSubagentPanel
          toolCall={activeSubagent}
          onClose={() => setActiveSubagent(null)}
          scrollRef={subagentScrollRef}
        />
      </div>
      <AgentInput
        inputText={inputText}
        isStreaming={isStreaming}
        onInputChange={setInputText}
        onSend={() => sendMessage(undefined, selectedSelection)}
        onStop={stopStreaming}
        onClear={createNewChat}
        onUndo={undoLastTurn}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        modelOptions={selectOptions}
        hasModelOptions={hasModelOptions}
        projectId={currentProjectId}
        projectPath={currentProjectPath}
        inputTextareaRef={inputTextareaRef}
        pendingRequest={pendingRequest}
        onPermissionRespond={respondPermission}
        worktreeOptions={worktreeOptions}
        onWorktreeSelect={handleWorktreeSelect}
      />
      <AgentStatusBar projectPath={statusBarPath} />
    </div>
  )
}
