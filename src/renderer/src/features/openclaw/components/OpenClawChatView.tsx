import type { OpenClawChatMessage, OpenClawConnectionStatus } from "@shared/contracts/openclaw"
import type { OpenClawSettings } from "@shared/settings"
import { Loader2, Plus, RefreshCw, Send, Square, Trash2 } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useBottomSideBarStore } from "@/components/layout/bottomSideBarStore"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMarkdownPreview } from "@/components/ui/LxMarkdown/LxMarkdownPreview"
import { markdownRenderer } from "@/components/ui/LxMarkdown/utils/markdownRenderer"
import { LxSelect } from "@/components/ui/LxSelect"
import { useLxToast } from "@/components/ui/LxToast"
import {
  ensureOpenClawEventSubscription,
  openClawSessionKey,
  useOpenClawChatStore,
} from "@/features/openclaw/openclawChatStore"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { subscribeSettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { type TranslationKey, useTranslation } from "@/i18n"

interface OpenClawChatViewProps {
  isExpanded: boolean
  rightActions?: React.ReactNode
}

// 连接状态指示灯配色。
const STATUS_DOT_CLASS: Record<OpenClawConnectionStatus, string> = {
  connected: "bg-emerald-400",
  connecting: "bg-amber-400 animate-pulse",
  disconnected: "bg-zinc-500",
  "pairing-required": "bg-amber-400 animate-pulse",
  error: "bg-red-400",
}

// 连接状态文案。
const STATUS_LABEL_KEYS: Record<OpenClawConnectionStatus, TranslationKey> = {
  connected: "openclaw.statusConnected",
  connecting: "openclaw.statusConnecting",
  disconnected: "openclaw.statusDisconnected",
  "pairing-required": "openclaw.statusPairingRequired",
  error: "openclaw.statusError",
}

// 单条助手消息：独立持有预览引用，复用项目 Markdown 渲染链路。
const AssistantMessage = ({ content }: { content: string }): React.JSX.Element => {
  const previewRef = useRef<HTMLElement | null>(null)
  return (
    <div className="max-w-full rounded-[10px] border border-white/6 bg-white/[0.03] px-3 py-2">
      <LxMarkdownPreview
        html={markdownRenderer.render(content)}
        previewMode="preview"
        previewRef={previewRef}
        className="px-0"
        contentClassName="py-0"
      />
    </div>
  )
}

/**
 * 底边栏 OpenClaw 会话视图：切换实例/Agent，发送任务并流式接收回复。
 */
export const OpenClawChatView = ({ rightActions }: OpenClawChatViewProps): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [config, setConfig] = useState<OpenClawSettings>({ instances: {} })
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const instanceId = useBottomSideBarStore((state) => state.openClawInstanceId)
  const agentId = useBottomSideBarStore((state) => state.openClawAgentId)
  const setOpenClawTarget = useBottomSideBarStore((state) => state.setOpenClawTarget)

  const session = useOpenClawChatStore((state) =>
    instanceId && agentId ? state.sessions[openClawSessionKey(instanceId, agentId)] : undefined,
  )

  // 会话事件的全局订阅只需建立一次。
  useEffect(() => {
    ensureOpenClawEventSubscription()
  }, [])

  const loadConfig = useCallback(async (): Promise<void> => {
    try {
      const loaded = await settingsApi.getOpenClawSettings()
      setConfig(loaded)
    } catch (error) {
      console.error("[OpenClawChatView] Failed to load settings:", error)
    }
  }, [])

  useEffect(() => {
    void loadConfig()
    return subscribeSettingsChanged("openclaw", () => {
      void loadConfig()
    })
  }, [loadConfig])

  const enabledInstances = useMemo(
    () => Object.entries(config.instances).filter(([, instance]) => instance.enabled),
    [config.instances],
  )

  const currentInstance = instanceId ? config.instances[instanceId] : undefined
  const agents = useMemo(
    () => (currentInstance?.enabled ? currentInstance.agents : []),
    [currentInstance],
  )

  // 未选中目标时，自动落到第一个启用实例及其首个 Agent。
  useEffect(() => {
    if (enabledInstances.length === 0) return
    if (!instanceId) {
      const [firstId, firstInstance] = enabledInstances[0] ?? []
      if (firstId) setOpenClawTarget(firstId, firstInstance?.agents[0]?.id ?? "")
      return
    }
    const instance = config.instances[instanceId]
    if (!instance?.enabled) {
      const [firstId, firstInstance] = enabledInstances[0] ?? []
      if (firstId) setOpenClawTarget(firstId, firstInstance?.agents[0]?.id ?? "")
      return
    }
    if (!agentId && instance.agents[0]) {
      setOpenClawTarget(instanceId, instance.agents[0].id)
    }
  }, [enabledInstances, config.instances, instanceId, agentId, setOpenClawTarget])

  // 目标变化时建立连接并加载会话快照。
  useEffect(() => {
    if (!instanceId || !agentId) return
    const { connect, loadSession } = useOpenClawChatStore.getState()
    void connect(instanceId)
    void loadSession(instanceId, agentId)
  }, [instanceId, agentId])

  // 消息更新时滚动到底部。
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [session?.messages.length, session?.messages[session.messages.length - 1]?.content])

  const handleSend = async (): Promise<void> => {
    const text = input.trim()
    if (!text || !instanceId || !agentId) return
    setIsSending(true)
    try {
      await useOpenClawChatStore.getState().sendMessage(instanceId, agentId, text)
      setInput("")
    } catch (error) {
      console.error("[OpenClawChatView] Failed to send message:", error)
      toast.error(t("openclaw.sendFailed"))
    } finally {
      setIsSending(false)
    }
  }

  const handleAbort = async (): Promise<void> => {
    if (!instanceId || !agentId) return
    try {
      await useOpenClawChatStore.getState().abort(instanceId, agentId)
    } catch (error) {
      console.error("[OpenClawChatView] Failed to abort run:", error)
    }
  }

  const handleClear = async (): Promise<void> => {
    if (!instanceId || !agentId) return
    try {
      await useOpenClawChatStore.getState().clearMessages(instanceId, agentId)
      toast.success(t("openclaw.sessionCleared"))
    } catch (error) {
      console.error("[OpenClawChatView] Failed to clear messages:", error)
    }
  }

  const handleNewSession = async (): Promise<void> => {
    if (!instanceId || !agentId) return
    try {
      await useOpenClawChatStore.getState().resetSession(instanceId, agentId)
      toast.success(t("openclaw.sessionCleared"))
    } catch (error) {
      console.error("[OpenClawChatView] Failed to reset session:", error)
    }
  }

  const status: OpenClawConnectionStatus = session?.connectionStatus ?? "disconnected"
  const isStreaming = session?.isStreaming ?? false
  const messages = session?.messages ?? []

  const renderMessage = (message: OpenClawChatMessage): React.JSX.Element => {
    if (message.role === "user") {
      return (
        <div key={message.id} className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[10px] border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-xs text-white/85">
            {message.content}
          </div>
        </div>
      )
    }

    if (message.role === "system") {
      const text =
        message.code === "approval-required"
          ? `${t("openclaw.approvalRequired")}${message.content ? ` (requestId: ${message.content})` : ""}`
          : message.content
      return (
        <div
          key={message.id}
          className="rounded-[8px] border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200/80"
        >
          {text}
        </div>
      )
    }

    return (
      <div key={message.id} className="flex flex-col gap-1">
        <AssistantMessage content={message.content} />
        {message.status === "error" && message.error ? (
          <span className="px-1 text-[11px] text-rose-300">{message.error}</span>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex h-full w-full min-h-0 flex-col overflow-hidden">
      {/* 顶部工具条 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-1 pb-1.5">
        <LxSelect
          size="small"
          position="up"
          className="w-36"
          value={instanceId ?? ""}
          placeholder={t("openclaw.instanceLabel")}
          options={enabledInstances.map(([id, instance]) => ({
            value: id,
            label: instance.name,
          }))}
          onChange={(value) => {
            const next = config.instances[value]
            setOpenClawTarget(value, next?.agents[0]?.id ?? "")
          }}
        />
        <LxSelect
          size="small"
          position="up"
          className="w-36"
          value={agentId ?? ""}
          placeholder={t("openclaw.agentLabel")}
          disabled={agents.length === 0}
          options={agents.map((agent) => ({ value: agent.id, label: agent.name }))}
          onChange={(value) => {
            if (instanceId) setOpenClawTarget(instanceId, value)
          }}
        />

        <span className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[status]}`} />
          {t(STATUS_LABEL_KEYS[status])}
        </span>

        <div className="flex-1" />

        <LxIconButton
          size="small"
          aria-label={t("openclaw.reconnect")}
          title={{ content: t("openclaw.reconnect"), placement: "top" }}
          disabled={!instanceId}
          onClick={() => {
            if (instanceId) void useOpenClawChatStore.getState().connect(instanceId)
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </LxIconButton>
        <LxIconButton
          size="small"
          aria-label={t("openclaw.clearMessages")}
          title={{ content: t("openclaw.clearMessages"), placement: "top" }}
          disabled={!instanceId || messages.length === 0}
          onClick={() => void handleClear()}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </LxIconButton>
        <LxIconButton
          size="small"
          aria-label={t("openclaw.newSession")}
          title={{ content: t("openclaw.newSession"), placement: "top" }}
          disabled={!instanceId || !agentId}
          onClick={() => void handleNewSession()}
        >
          <Plus className="h-3.5 w-3.5" />
        </LxIconButton>

        {rightActions}
      </div>

      {/* 消息流 */}
      <div ref={scrollRef} className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-1 py-2">
        {!instanceId || !agentId ? (
          <p className="px-2 py-4 text-center text-xs text-white/45">
            {enabledInstances.length === 0 ? t("openclaw.noInstances") : t("openclaw.noAgents")}
          </p>
        ) : messages.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-white/45">{t("openclaw.emptyState")}</p>
        ) : (
          <div className="flex flex-col gap-2">{messages.map(renderMessage)}</div>
        )}

        {session?.connectionError ? (
          <p className="px-2 pt-2 text-[11px] text-rose-300">{session.connectionError}</p>
        ) : null}
        {status === "pairing-required" ? (
          <p className="px-2 pt-2 text-[11px] text-amber-200/80">
            {t("openclaw.pairingHint", { requestId: session?.pairingRequestId ?? "" })}
          </p>
        ) : null}
      </div>

      {/* 输入区 */}
      <div className="flex shrink-0 items-end gap-2 border-t border-white/5 px-1 pt-1.5">
        <LxInput
          multiline
          rows={2}
          className="min-h-0 flex-1"
          value={input}
          placeholder={t("openclaw.placeholder")}
          disabled={!instanceId || !agentId}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              void handleSend()
            }
          }}
        />
        {isStreaming ? (
          <LxIconButton
            size="medium"
            aria-label={t("openclaw.abort")}
            title={{ content: t("openclaw.abort"), placement: "top" }}
            onClick={() => void handleAbort()}
          >
            <Square className="h-4 w-4 text-rose-300" />
          </LxIconButton>
        ) : (
          <LxIconButton
            size="medium"
            aria-label={t("openclaw.send")}
            title={{ content: t("openclaw.send"), placement: "top" }}
            disabled={!input.trim() || !instanceId || !agentId || isSending}
            onClick={() => void handleSend()}
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </LxIconButton>
        )}
      </div>
    </div>
  )
}
