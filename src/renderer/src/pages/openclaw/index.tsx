import type { OpenClawConnectionStatus } from "@shared/contracts/openclaw"
import { LayoutGrid, MessagesSquare, Plus, RefreshCw, Send, Square } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import {
  accentHexForIndex,
  accentNumberForIndex,
  type ConversationAgent,
  matchOpenClawCommand,
  type OfficeAgentStatus,
  type OpenClawCommandId,
  OpenClawConversationView,
  OpenClawInput,
  type OpenClawInputPicker,
  type OpenClawInputRef,
  resolveClawDispatchTargets,
  resolveOfficeAgentStatus,
  useOpenClawChatStore,
  useOpenClawConfig,
  useOpenClawOffice,
  useOpenClawWorkspaceStore,
} from "@/features/openclaw"
import { OpenClawOfficeView } from "@/features/openclaw/components/OpenClawOfficeView"
import type { OfficeSceneAgent } from "@/features/openclaw/office/officeScene"
import { type TranslationKey, useTranslation } from "@/i18n"

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

/**
 * OpenClaw 页面：一个办公区（实例）= 一条对话流，支持对话模式与像素工作区模式切换。
 */
export const OpenClawPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const { instances, enabledInstances } = useOpenClawConfig()

  const viewMode = useOpenClawWorkspaceStore((state) => state.viewMode)
  const toggleViewMode = useOpenClawWorkspaceStore((state) => state.toggleViewMode)
  const selectedInstanceId = useOpenClawWorkspaceStore((state) => state.selectedInstanceId)
  const selectedAgentIds = useOpenClawWorkspaceStore((state) => state.selectedAgentIds)
  const selectOffice = useOpenClawWorkspaceStore((state) => state.selectOffice)
  const selectAgent = useOpenClawWorkspaceStore((state) => state.selectAgent)
  const setSelectedAgentIds = useOpenClawWorkspaceStore((state) => state.setSelectedAgentIds)
  const consumePendingDispatch = useOpenClawWorkspaceStore((state) => state.consumePendingDispatch)

  const [input, setInput] = useState("")
  const [pickerKind, setPickerKind] = useState<"agent" | "office" | null>(null)
  const inputRef = useRef<OpenClawInputRef | null>(null)
  const inputAnchorRef = useRef<HTMLDivElement | null>(null)

  const currentInstance = selectedInstanceId ? instances[selectedInstanceId] : undefined
  const agents = useMemo(
    () => (currentInstance?.enabled ? currentInstance.agents : []),
    [currentInstance],
  )
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents])

  const { sessions, timeline, isAnyStreaming } = useOpenClawOffice(selectedInstanceId, agentIds)

  const statuses = useMemo<Record<string, OfficeAgentStatus>>(
    () =>
      Object.fromEntries(
        sessions.map((session) => [session.agentId, resolveOfficeAgentStatus(session.snapshot)]),
      ),
    [sessions],
  )

  const officeStatus = useMemo<OpenClawConnectionStatus>(() => {
    const states = sessions.map((session) => session.snapshot?.connectionStatus)
    if (states.some((state) => state === "error")) return "error"
    if (states.some((state) => state === "pairing-required")) return "pairing-required"
    if (states.some((state) => state === "connecting")) return "connecting"
    if (states.some((state) => state === "connected")) return "connected"
    return "disconnected"
  }, [sessions])

  const streamingAgentIds = useMemo(
    () =>
      sessions.filter((session) => session.snapshot?.isStreaming).map((session) => session.agentId),
    [sessions],
  )

  const candidates = useMemo(
    () =>
      agents.map((agent) => ({
        instanceId: selectedInstanceId ?? "",
        agentId: agent.id,
        name: agent.name,
        instanceName: currentInstance?.name ?? "",
      })),
    [agents, selectedInstanceId, currentInstance],
  )

  const conversationAgents = useMemo<ConversationAgent[]>(
    () =>
      agents.map((agent, index) => ({
        agentId: agent.id,
        name: agent.name,
        accent: accentHexForIndex(index),
      })),
    [agents],
  )

  const officeAgents = useMemo<OfficeSceneAgent[]>(
    () =>
      agents.map((agent, index) => ({
        agentId: agent.id,
        name: agent.name,
        accent: accentNumberForIndex(index),
      })),
    [agents],
  )

  // 跨页派发的 @claw 委派：定位办公区/员工后立即下发任务。
  useEffect(() => {
    const dispatch = consumePendingDispatch()
    if (!dispatch) return
    selectOffice(dispatch.instanceId, dispatch.agentId)
    const store = useOpenClawChatStore.getState()
    void store
      .connect(dispatch.instanceId)
      .then(() => store.sendMessage(dispatch.instanceId, dispatch.agentId, dispatch.task))
  }, [consumePendingDispatch, selectOffice])

  // 未选中或已失效时，回落到第一个启用实例及其首个员工。
  // 配置尚未加载（enabledInstances 为空）时不做处理，避免清掉跨页派发刚定位的目标。
  useEffect(() => {
    if (enabledInstances.length === 0) return
    const isCurrentEnabled = enabledInstances.some((item) => item.id === selectedInstanceId)
    if (isCurrentEnabled) return
    const first = enabledInstances[0]
    selectOffice(first?.id ?? null, first?.instance.agents[0]?.id)
  }, [enabledInstances, selectedInstanceId, selectOffice])

  // 办公区切换后清理不属于当前办公区的选中项。
  useEffect(() => {
    if (selectedAgentIds.length === 0) return
    const valid = selectedAgentIds.filter((id) => agentIds.includes(id))
    if (valid.length !== selectedAgentIds.length) {
      setSelectedAgentIds(valid.length > 0 ? valid : agentIds.slice(0, 1))
    }
  }, [agentIds, selectedAgentIds, setSelectedAgentIds])

  const runCommand = useCallback(
    (command: OpenClawCommandId): void => {
      if (!selectedInstanceId) return
      const store = useOpenClawChatStore.getState()
      switch (command) {
        case "clear":
          for (const agentId of agentIds) void store.clearMessages(selectedInstanceId, agentId)
          toast.success(t("openclaw.sessionCleared"))
          break
        case "new":
          for (const agentId of agentIds) void store.resetSession(selectedInstanceId, agentId)
          toast.success(t("openclaw.sessionCleared"))
          break
        case "stop":
          for (const session of sessions) {
            if (session.snapshot?.isStreaming) {
              void store.abort(selectedInstanceId, session.agentId)
            }
          }
          break
        case "agent":
          setPickerKind("agent")
          break
        case "office":
          setPickerKind("office")
          break
        case "mode":
          toggleViewMode()
          break
      }
    },
    [agentIds, selectedInstanceId, sessions, t, toast, toggleViewMode],
  )

  // 发送：命令优先；`@claw` 提及或选中集合决定扇出目标。
  const handleSend = useCallback((): void => {
    const text = input.trim()
    if (!text) return

    const command = matchOpenClawCommand(text)
    if (command) {
      setInput("")
      runCommand(command)
      return
    }

    if (!selectedInstanceId) return
    const { body, agentIds: targets } = resolveClawDispatchTargets(text, agentIds, selectedAgentIds)
    if (targets.length === 0) {
      toast.error(t("openclaw.noTarget"))
      return
    }
    if (!body) {
      toast.error(t("agent.clawTaskRequired"))
      return
    }

    setInput("")
    const store = useOpenClawChatStore.getState()
    for (const agentId of targets) {
      void store.sendMessage(selectedInstanceId, agentId, body).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : t("openclaw.sendFailed"))
      })
    }
  }, [agentIds, input, runCommand, selectedAgentIds, selectedInstanceId, t, toast])

  const picker = useMemo<OpenClawInputPicker | null>(() => {
    if (pickerKind === "office") {
      return {
        key: "office",
        title: t("openclaw.officePickerTitle"),
        emptyText: t("openclaw.noInstances"),
        items: enabledInstances.map(({ id, instance }) => ({
          id,
          label: instance.name,
          hint: t("settings.openclawAgentCount", { count: instance.agents.length }),
          selected: id === selectedInstanceId,
        })),
        onPick: (id) => {
          selectOffice(id, instances[id]?.agents[0]?.id)
          setPickerKind(null)
          inputRef.current?.focus()
        },
      }
    }
    if (pickerKind === "agent") {
      return {
        key: "agent",
        title: t("openclaw.agentPickerTitle"),
        emptyText: t("openclaw.noAgents"),
        items: agents.map((agent) => ({
          id: agent.id,
          label: agent.name,
          hint: agent.id,
          selected: selectedAgentIds.includes(agent.id),
        })),
        // 选择面板保持打开，便于连续多选（扇出目标）。
        onPick: (id) => selectAgent(id, { additive: true }),
      }
    }
    return null
  }, [
    agents,
    enabledInstances,
    instances,
    pickerKind,
    selectAgent,
    selectOffice,
    selectedAgentIds,
    selectedInstanceId,
    t,
  ])

  const handleReconnect = (): void => {
    if (selectedInstanceId) void useOpenClawChatStore.getState().connect(selectedInstanceId)
  }

  const handleNewSession = (): void => {
    if (!selectedInstanceId) return
    const store = useOpenClawChatStore.getState()
    for (const agentId of agentIds) void store.resetSession(selectedInstanceId, agentId)
    toast.success(t("openclaw.sessionCleared"))
  }

  const selectedNames = agents
    .filter((agent) => selectedAgentIds.includes(agent.id))
    .map((agent) => agent.name)

  return (
    <section className="openclaw-page-container flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {/* 顶部工具条：办公区标题、连接状态、模式切换与操作 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-white/80">
          {currentInstance?.name ?? t("nav.openclaw")}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[officeStatus]}`} />
          {t(STATUS_LABEL_KEYS[officeStatus])}
        </span>

        <div className="flex-1" />

        <LxIconButton
          size="small"
          aria-label={t("openclaw.reconnect")}
          title={{ content: t("openclaw.reconnect"), placement: "bottom" }}
          disabled={!selectedInstanceId}
          onClick={handleReconnect}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </LxIconButton>
        <LxIconButton
          size="small"
          aria-label={t("openclaw.newSession")}
          title={{ content: t("openclaw.newSession"), placement: "bottom" }}
          disabled={!selectedInstanceId}
          onClick={handleNewSession}
        >
          <Plus className="h-3.5 w-3.5" />
        </LxIconButton>

        <div className="mx-1 h-4 w-px bg-white/10" />

        <LxIconButton
          size="small"
          aria-label={t("openclaw.modeConversation")}
          title={{ content: t("openclaw.modeConversation"), placement: "bottom" }}
          highlighted={viewMode === "conversation"}
          onClick={() => useOpenClawWorkspaceStore.getState().setViewMode("conversation")}
        >
          <MessagesSquare className="h-3.5 w-3.5" />
        </LxIconButton>
        <LxIconButton
          size="small"
          aria-label={t("openclaw.modeWorkspace")}
          title={{ content: t("openclaw.modeWorkspace"), placement: "bottom" }}
          highlighted={viewMode === "workspace"}
          onClick={() => useOpenClawWorkspaceStore.getState().setViewMode("workspace")}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
        </LxIconButton>
      </div>

      {/* 视图区：两模式常驻 DOM 保活（像素场景不因切换销毁） */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div
          className={`min-h-0 flex-1 overflow-hidden ${viewMode === "conversation" ? "flex" : "hidden"}`}
        >
          <OpenClawConversationView
            timeline={timeline}
            agents={conversationAgents}
            streamingAgentIds={streamingAgentIds}
          />
        </div>
        <div
          className={`min-h-0 flex-1 overflow-hidden ${viewMode === "workspace" ? "flex" : "hidden"}`}
        >
          <OpenClawOfficeView
            agents={officeAgents}
            statuses={statuses}
            selectedAgentIds={selectedAgentIds}
            onSelectAgent={(agentId, additive) => selectAgent(agentId, { additive })}
          />
        </div>
      </div>

      {/* 输入区 */}
      <div ref={inputAnchorRef} className="shrink-0 border-t border-white/5 px-3 py-2">
        {selectedNames.length > 0 ? (
          <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[11px] text-white/40">
            <span>{t("openclaw.targetLabel")}</span>
            {selectedNames.map((name) => (
              <span
                key={name}
                className="rounded-[4px] bg-white/[0.06] px-1.5 py-0.5 text-white/60"
              >
                {name}
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <OpenClawInput
            ref={inputRef}
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onStop={() => {
              if (!selectedInstanceId) return
              for (const agentId of streamingAgentIds) {
                void useOpenClawChatStore.getState().abort(selectedInstanceId, agentId)
              }
            }}
            candidates={candidates}
            onCommand={runCommand}
            picker={picker}
            onPickerClose={() => setPickerKind(null)}
            panelAnchorRef={inputAnchorRef}
            placeholder={t("openclaw.placeholder")}
            disabled={agentIds.length === 0}
            isStreaming={isAnyStreaming}
          />
          {isAnyStreaming ? (
            <LxIconButton
              size="medium"
              aria-label={t("openclaw.abort")}
              title={{ content: t("openclaw.abort"), placement: "top" }}
              onClick={() => {
                if (!selectedInstanceId) return
                for (const agentId of streamingAgentIds) {
                  void useOpenClawChatStore.getState().abort(selectedInstanceId, agentId)
                }
              }}
            >
              <Square className="h-4 w-4 text-rose-300" />
            </LxIconButton>
          ) : (
            <LxIconButton
              size="medium"
              aria-label={t("openclaw.send")}
              title={{ content: t("openclaw.send"), placement: "top" }}
              disabled={!input.trim() || agentIds.length === 0}
              onClick={handleSend}
            >
              <Send className="h-4 w-4" />
            </LxIconButton>
          )}
        </div>
      </div>
    </section>
  )
}
