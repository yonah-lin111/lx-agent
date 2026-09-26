import type {
  AutoConfigurableMode,
  CollaborationMode,
  SandboxPolicy,
} from "@shared/contracts/agent"
import { ArrowLeft, ArrowRight, Loader2, MessageCircleQuestion, X } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { renderMarkdown } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { type BtwThread, btwStore } from "../../hooks/btwStore"
import { AgentInput } from "../AgentInput"
import type { AgentInputFile } from "../AgentInput/AgentInputFiles"
import type { AgentModelSelectProps } from "../AgentModelSelect"
import { AgentStatusBar } from "../status-bar"

interface AgentBtwPanelProps {
  // 面板是否展开（false = 上移收起，保持挂载）。
  isOpen: boolean
  // 关闭面板。
  onClose: () => void
  // 当前侧问数据归属（会话 id 或草稿 Tab key）。
  ownerKey: string | null
  // 当前是否有 btw 请求在途（输入框禁用 + spinner）。
  isPending: boolean
  // 发送侧问（面板输入框）。
  onAsk: (question: string) => void
  // 模型展示（只读）。
  selectedModel: string
  selectedVariant?: string
  availableVariants?: string[]
  modelOptions: AgentModelSelectProps["options"]
  hasModelOptions: boolean
  // 输入区模式底纹与只读状态栏。
  collaborationMode?: CollaborationMode
  effectiveMode?: CollaborationMode
  agentMode?: CollaborationMode
  autoEnabledModes?: AutoConfigurableMode[]
  projectPath?: string
  projectId?: string
  sandboxPolicy?: SandboxPolicy
}

// 稳定空引用：AgentInput 文件列表与空态判断复用。
const EMPTY_FILES: AgentInputFile[] = []

// 时间显示（HH:mm）。
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

/**
 * AgentBtwPanel - btw 侧问面板：全区域覆盖消息列表与主输入区，
 * 头部左右切换侧问线，底部为精简版 AgentInput 与只读 AgentStatusBar。
 */
export const AgentBtwPanel = ({
  isOpen,
  onClose,
  ownerKey,
  isPending,
  onAsk,
  selectedModel,
  selectedVariant,
  availableVariants,
  modelOptions,
  hasModelOptions,
  collaborationMode,
  effectiveMode,
  agentMode,
  autoEnabledModes,
  projectPath,
  projectId,
  sandboxPolicy,
}: AgentBtwPanelProps): React.JSX.Element => {
  const { t } = useTranslation()
  const [inputText, setInputText] = useState("")
  // 当前查看的侧问线 id；null = 跟随最新（新侧问自动跳到最新）。
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const getThreads = useCallback((): BtwThread[] => btwStore.getThreads(ownerKey), [ownerKey])
  const threads = useSyncExternalStore(btwStore.subscribe, getThreads)

  const selectedIndex = threads.findIndex((thread) => thread.id === selectedThreadId)
  const threadIndex = selectedIndex >= 0 ? selectedIndex : threads.length - 1
  const thread = threadIndex >= 0 ? threads[threadIndex] : undefined

  // 打开面板时聚焦输入框并跟随最新侧问线。
  useEffect(() => {
    if (!isOpen) return
    setSelectedThreadId(null)
    inputRef.current?.focus()
  }, [isOpen])

  // 消息变化（新增问答/切换侧问线）时滚动到底部。
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [thread, isPending, isOpen])

  const handleSend = (): void => {
    const question = inputText.trim()
    if (!question || isPending) return
    setInputText("")
    setSelectedThreadId(null)
    onAsk(question)
  }

  const handleThreadChange = (offset: -1 | 1): void => {
    const next = threads[threadIndex + offset]
    if (next) setSelectedThreadId(next.id)
  }

  return (
    <div
      role="dialog"
      aria-label={t("agent.btwTitle")}
      inert={!isOpen}
      className="agent-btw-panel absolute inset-0 z-20 flex flex-col bg-[var(--color-theme-surface,#262626)] shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
      style={{
        transform: isOpen ? "translateY(0)" : "translateY(-100%)",
        transition: "transform 0.28s cubic-bezier(0.2, 0.85, 0.2, 1)",
        pointerEvents: isOpen ? "auto" : "none",
      }}
    >
      {/* 面板头部：标题 + 侧问线左右切换（左=更早/右=更晚）+ 关闭。 */}
      <div className="agent-btw-panel-header flex shrink-0 items-center gap-2 border-b border-white/10 px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <MessageCircleQuestion className="h-3.5 w-3.5 shrink-0 text-sky-400" />
          <span className="truncate text-sm text-white/80">{t("agent.btwTitle")}</span>
          {thread && (
            <span className="shrink-0 truncate text-xs text-white/40">
              {t("agent.btwThreadIndex", {
                current: threadIndex + 1,
                total: threads.length,
              })}
              {" · "}
              {formatTime(thread.messages[0]?.createdAt ?? thread.createdAt)}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <LxTooltip content={t("agent.btwPrevThread")} placement="bottom">
            <LxIconButton
              size="small"
              aria-label={t("agent.btwPrevThread")}
              disabled={threadIndex <= 0}
              onClick={() => handleThreadChange(-1)}
            >
              <ArrowLeft />
            </LxIconButton>
          </LxTooltip>
          <LxTooltip content={t("agent.btwNextThread")} placement="bottom">
            <LxIconButton
              size="small"
              aria-label={t("agent.btwNextThread")}
              disabled={threadIndex < 0 || threadIndex >= threads.length - 1}
              onClick={() => handleThreadChange(1)}
            >
              <ArrowRight />
            </LxIconButton>
          </LxTooltip>
          <LxIconButton
            size="small"
            aria-label={t("agent.closeBtwPanel")}
            title={{ content: t("agent.closeBtwPanel"), placement: "bottom" }}
            onClick={onClose}
          >
            <X />
          </LxIconButton>
        </div>
      </div>

      {/* 侧问消息列表：问题为右侧气泡，回答为 Markdown 渲染。 */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {!thread ? (
          <div className="flex h-full items-center justify-center text-xs text-white/40">
            {t("agent.btwEmpty")}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {thread.messages.map((message) =>
              message.role === "user" ? (
                <div
                  key={message.id}
                  className="agent-btw-user-bubble max-w-[85%] self-end rounded-[6px] bg-[var(--color-user-bubble,rgba(255,255,255,0.1))] px-2.5 py-1.5 text-sm whitespace-pre-wrap break-words text-white/90"
                >
                  {message.content}
                </div>
              ) : message.failed ? (
                <div key={message.id} className="self-start px-1 text-sm text-rose-300/90">
                  {message.content}
                </div>
              ) : (
                <LxMarkdownPreview
                  key={message.id}
                  html={renderMarkdown(message.content)}
                  previewMode="preview"
                  className="px-0"
                  contentClassName="py-0.5"
                  sanitizeCopy
                />
              ),
            )}
            {isPending && threadIndex === threads.length - 1 && (
              <div className="flex items-center gap-1.5 self-start px-1 text-xs text-white/45">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                <span>{t("agent.btwThinking")}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 面板输入区：精简版 AgentInput（文本 + 发送 + 只读模型）。 */}
      <AgentInput
        inputText={inputText}
        isStreaming={isPending}
        isCompacting={false}
        queuedCount={0}
        queuedMessages={[]}
        onInputChange={setInputText}
        onSend={handleSend}
        onStop={() => undefined}
        onClear={() => undefined}
        onUndo={() => undefined}
        onCompact={() => undefined}
        selectedModel={selectedModel}
        selectedVariant={selectedVariant}
        availableVariants={availableVariants}
        onModelChange={() => undefined}
        onVariantChange={() => undefined}
        modelOptions={modelOptions}
        hasModelOptions={hasModelOptions}
        inputTextareaRef={inputRef}
        projectId={projectId}
        projectPath={projectPath}
        worktreeOptions={null}
        onWorktreeSelect={() => undefined}
        selectedFiles={EMPTY_FILES}
        onFilesChange={() => undefined}
        supportsImages={false}
        collaborationMode={collaborationMode}
        effectiveMode={effectiveMode}
        agentMode={agentMode}
        autoEnabledModes={autoEnabledModes}
        variant="btw"
        placeholder={t("agent.btwInputPlaceholder")}
      />
      <AgentStatusBar
        projectPath={projectPath}
        projectId={projectId}
        allowProjectChange={false}
        collaborationMode={collaborationMode}
        effectiveMode={effectiveMode}
        sandboxPolicy={sandboxPolicy}
        pendingRequest={null}
        onPermissionRespond={() => undefined}
        readOnly
      />
    </div>
  )
}
