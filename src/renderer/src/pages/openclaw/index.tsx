import type { OpenClawConnectionStatus } from "@shared/contracts/openclaw"
import { Plus, RefreshCw } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { useLxToast } from "@/components/ui/LxToast"
import {
  accentHexForIndex,
  type ConversationAgent,
  type OpenClawCommandId,
  OpenClawInput,
  type OpenClawInputPicker,
  type OpenClawInputRef,
  OpenClawMessageList,
  type OpenClawTargetOffice,
  parseOpenClawCommand,
  resolveClawDispatchTargets,
  splitClearAgentNames,
  toggleClearAgentName,
  useOpenClawChatStore,
  useOpenClawConfig,
  useOpenClawOffice,
  useOpenClawOfficeStore,
} from "@/features/openclaw"
import { notifySettingsChanged } from "@/features/settings"
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
 * OpenClaw 页面：查看当前选中员工的会话；`/clear` 选择或新建该员工的会话。
 */
export const OpenClawPage = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()
  const { instances, enabledInstances } = useOpenClawConfig()

  const selectedInstanceId = useOpenClawOfficeStore((state) => state.selectedInstanceId)
  const selectedAgentIds = useOpenClawOfficeStore((state) => state.selectedAgentIds)
  const activeAgentId = useOpenClawOfficeStore((state) => state.activeAgentId)
  const selectOffice = useOpenClawOfficeStore((state) => state.selectOffice)
  const selectAgent = useOpenClawOfficeStore((state) => state.selectAgent)
  const setSelectedAgentIds = useOpenClawOfficeStore((state) => state.setSelectedAgentIds)
  const consumePendingDispatch = useOpenClawOfficeStore((state) => state.consumePendingDispatch)

  const [input, setInput] = useState("")
  const [pickerKind, setPickerKind] = useState<"office" | "session" | null>(null)
  // session 面板模式：compose 追加 `/clear <name>` 参数；execute 选中即新建。
  const [sessionMode, setSessionMode] = useState<"compose" | "execute">("compose")
  const inputRef = useRef<OpenClawInputRef | null>(null)

  const currentInstance = selectedInstanceId ? instances[selectedInstanceId] : undefined
  const agents = useMemo(
    () => (currentInstance?.enabled ? currentInstance.agents : []),
    [currentInstance],
  )
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents])

  const { sessions, timeline, isAnyStreaming } = useOpenClawOffice(selectedInstanceId, agentIds)

  const activeAgent = useMemo(
    () => agents.find((agent) => agent.id === activeAgentId),
    [activeAgentId, agents],
  )

  const officeStatus = useMemo<OpenClawConnectionStatus>(() => {
    const states = sessions.map((session) => session.snapshot?.connectionStatus)
    if (states.some((state) => state === "error")) return "error"
    if (states.some((state) => state === "pairing-required")) return "pairing-required"
    if (states.some((state) => state === "connecting")) return "connecting"
    if (states.some((state) => state === "connected")) return "connected"
    return "disconnected"
  }, [sessions])

  const officeError = useMemo<string | undefined>(() => {
    for (const session of sessions) {
      if (session.snapshot?.connectionError) return session.snapshot.connectionError
    }
    return undefined
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

  // 构建用于输入框选择器的办公区与员工列表
  const offices = useMemo<OpenClawTargetOffice[]>(
    () =>
      enabledInstances.map(({ id, instance }) => ({
        id,
        name: instance.name,
        agents: instance.agents.map((a) => ({ id: a.id, name: a.name })),
      })),
    [enabledInstances],
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

  // 打开员工选择面板：compose 模式下选中会追加到 `/clear` 命令行。
  const openSessionPicker = useCallback(
    (mode: "compose" | "execute"): void => {
      if (!selectedInstanceId || agents.length === 0) {
        toast.error(t("openclaw.noAgents"))
        return
      }
      setSessionMode(mode)
      setPickerKind("session")
    },
    [agents.length, selectedInstanceId, t, toast],
  )

  const runCommand = useCallback(
    (command: OpenClawCommandId): void => {
      if (!selectedInstanceId) return
      const store = useOpenClawChatStore.getState()
      switch (command) {
        case "clear":
          openSessionPicker("compose")
          break
        case "stop":
          for (const session of sessions) {
            if (session.snapshot?.isStreaming) {
              void store.abort(selectedInstanceId, session.agentId)
            }
          }
          break
        case "office":
          setPickerKind("office")
          break
      }
    },
    [openSessionPicker, selectedInstanceId, sessions],
  )

  // 发送：命令优先；`@claw` 提及或选中集合决定扇出目标。
  const handleSend = useCallback((): void => {
    const text = input.trim()
    if (!text) return
    // 多选面板下回车直发：发送前收起面板。
    setPickerKind(null)

    const command = parseOpenClawCommand(text)
    if (command) {
      if (command.id === "clear") {
        const names = splitClearAgentNames(command.args)
        if (names.length === 0) {
          // 无参数：保留 `/clear` 文本并打开员工面板。
          runCommand("clear")
          return
        }
        if (!selectedInstanceId) return
        const targets = agents.filter((agent) =>
          names.some((name) => name.toLowerCase() === agent.name.toLowerCase()),
        )
        if (targets.length === 0) {
          toast.error(t("openclaw.sessionNoMatch"))
          return
        }
        setInput("")
        const store = useOpenClawChatStore.getState()
        for (const agent of targets) {
          void store.createSession(selectedInstanceId, agent.id).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error)
            toast.error(message || t("openclaw.sessionCreateFailed"))
          })
        }
        notifySettingsChanged("openclaw")
        toast.success(t("openclaw.sessionCreated", { count: targets.length }))
        return
      }
      setInput("")
      runCommand(command.id)
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
        const message = error instanceof Error ? error.message : String(error)
        toast.error(message || t("openclaw.sendFailed"))
      })
    }
  }, [agentIds, agents, input, runCommand, selectedAgentIds, selectedInstanceId, t, toast])

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
    if (pickerKind === "session") {
      const compose = sessionMode === "compose"
      const parsed = parseOpenClawCommand(input)
      const clearNames = compose && parsed?.id === "clear" ? splitClearAgentNames(parsed.args) : []
      const clearNameSet = new Set(clearNames.map((name) => name.toLowerCase()))
      return {
        key: `session:${sessionMode}`,
        title: t("openclaw.sessionPickerTitle"),
        emptyText: t("openclaw.noAgents"),
        // compose 模式为多选：空格切换员工，回车发送 `/clear` 命令。
        multiSelect: compose,
        items: agents.map((agent) => ({
          id: agent.id,
          label: agent.name,
          hint: agent.id,
          selected: compose
            ? clearNameSet.has(agent.name.toLowerCase())
            : agent.id === activeAgentId,
        })),
        onPick: (id) => {
          if (compose) {
            const agent = agents.find((item) => item.id === id)
            if (!agent) return
            setInput((current) => toggleClearAgentName(current, agent.name))
            return
          }
          setPickerKind(null)
          if (!selectedInstanceId) return
          selectAgent(id, { additive: false })
          void useOpenClawChatStore
            .getState()
            .createSession(selectedInstanceId, id)
            .then(() => {
              notifySettingsChanged("openclaw")
            })
            .catch((error: unknown) => {
              const message = error instanceof Error ? error.message : String(error)
              toast.error(message || t("openclaw.sessionCreateFailed"))
            })
        },
      }
    }
    return null
  }, [
    activeAgentId,
    agents,
    enabledInstances,
    input,
    instances,
    pickerKind,
    selectAgent,
    selectOffice,
    selectedInstanceId,
    sessionMode,
    t,
    toast,
  ])

  const handleReconnect = (): void => {
    if (selectedInstanceId) void useOpenClawChatStore.getState().connect(selectedInstanceId)
  }

  return (
    <section className="openclaw-page-container flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {/* 顶部工具条：办公区标题、连接状态与操作 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-white/80">
          {currentInstance?.name ?? t("nav.openclaw")}
          {activeAgent ? <span className="text-white/45">· {activeAgent.name}</span> : null}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/45">
          <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASS[officeStatus]}`} />
          {t(STATUS_LABEL_KEYS[officeStatus])}
          {officeStatus === "error" && officeError ? (
            <span className="max-w-[360px] truncate text-[11px] text-red-400" title={officeError}>
              ({officeError})
            </span>
          ) : null}
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
          aria-label={t("openclaw.sessionNew")}
          title={{ content: t("openclaw.sessionNew"), placement: "bottom" }}
          disabled={!selectedInstanceId || agents.length === 0}
          onClick={() => openSessionPicker("execute")}
        >
          <Plus className="h-3.5 w-3.5" />
        </LxIconButton>
      </div>

      {/* 视图区：当前办公区内所有员工的消息合流时间线 */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <OpenClawMessageList
          timeline={timeline}
          agents={conversationAgents}
          streamingAgentIds={streamingAgentIds}
        />
      </div>

      {/* 输入区 */}
      <div className="shrink-0 px-3 py-2">
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
          placeholder={t("openclaw.placeholder")}
          disabled={agentIds.length === 0}
          isStreaming={isAnyStreaming}
          offices={offices}
          selectedOfficeId={selectedInstanceId}
          selectedAgentIds={selectedAgentIds}
          onSelectOffice={(officeId) => {
            selectOffice(officeId, instances[officeId]?.agents[0]?.id)
          }}
          onToggleAgent={(agentId) => {
            selectAgent(agentId, { additive: true })
          }}
        />
      </div>
    </section>
  )
}
