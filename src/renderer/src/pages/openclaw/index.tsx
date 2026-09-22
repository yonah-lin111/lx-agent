import type { OpenClawAttachmentFile, OpenClawConnectionStatus } from "@shared/contracts/openclaw"
import { FilterX, Plus, RefreshCw } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import {
  accentHexForIndex,
  type ConversationAgent,
  filterOfficeTimeline,
  type OpenClawCommandId,
  OpenClawInput,
  type OpenClawInputPicker,
  type OpenClawInputRef,
  OpenClawMessageList,
  parseOpenClawCommand,
  resolveClawDispatchTargets,
  splitCommandAgentNames,
  toggleAllCommandAgentNames,
  toggleCommandAgentName,
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

// 仅附件发送时的占位正文：网关要求 message 非空，且该文本对远端模型可见，保持英语。
const formatAttachmentsOnlyMessage = (count: number): string =>
  `[attached ${count} image${count > 1 ? "s" : ""}]`

// 面板「全部员工」行的保留 id，与员工 id 命名空间隔离。
const PICKER_ALL_ID = "__all__"

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
  const onlyAgentIds = useOpenClawOfficeStore((state) => state.onlyAgentIds)
  const setOnlyAgentIds = useOpenClawOfficeStore((state) => state.setOnlyAgentIds)
  const pendingDispatch = useOpenClawOfficeStore((state) => state.pendingDispatch)
  const consumePendingDispatch = useOpenClawOfficeStore((state) => state.consumePendingDispatch)

  const [input, setInput] = useState("")
  const [files, setFiles] = useState<OpenClawAttachmentFile[]>([])
  const [pickerKind, setPickerKind] = useState<"office" | "session" | null>(null)
  const inputRef = useRef<OpenClawInputRef | null>(null)

  const currentInstance = selectedInstanceId ? instances[selectedInstanceId] : undefined
  const agents = useMemo(
    () => (currentInstance?.enabled ? currentInstance.agents : []),
    [currentInstance],
  )
  const agentIds = useMemo(() => agents.map((agent) => agent.id), [agents])

  const { sessions, timeline, isAnyStreaming } = useOpenClawOffice(selectedInstanceId, agentIds)

  // only 筛选只作用于视图：发送目标、会话数据与提及逻辑保持原样。
  const visibleTimeline = useMemo(
    () => filterOfficeTimeline(timeline, onlyAgentIds),
    [onlyAgentIds, timeline],
  )

  // 面板候选：只列消息列表中出现过的员工（含扇出目标），未产生消息的员工不进候选。
  const timelineAgentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const item of timeline) {
      ids.add(item.agentId)
      for (const agentId of item.targetAgentIds ?? []) ids.add(agentId)
    }
    return ids
  }, [timeline])

  const timelineAgents = useMemo(
    () => agents.filter((agent) => timelineAgentIds.has(agent.id)),
    [agents, timelineAgentIds],
  )

  const onlyCommandAvailable = timelineAgents.length > 1

  // 顶部工具条展示的扇出目标：按名册顺序取当前办公区中已选中的员工。
  const selectedAgents = useMemo(
    () => agents.filter((agent) => selectedAgentIds.includes(agent.id)),
    [agents, selectedAgentIds],
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

  // 会话级当前模型：作为消息自身未记录模型时的展示兜底。
  const sessionModelByAgent = useMemo(() => {
    const map = new Map<string, string>()
    for (const session of sessions) {
      const model = session.snapshot?.stats?.model
      if (model) map.set(session.agentId, model)
    }
    return map
  }, [sessions])

  const conversationAgents = useMemo<ConversationAgent[]>(
    () =>
      agents.map((agent, index) => {
        const model = sessionModelByAgent.get(agent.id)
        return {
          agentId: agent.id,
          name: agent.name,
          accent: accentHexForIndex(index),
          ...(model ? { model } : {}),
        }
      }),
    [agents, sessionModelByAgent],
  )

  // 跨页派发的 @claw 委派：定位办公区/员工后立即下发任务。
  // 订阅 pendingDispatch 而非仅在挂载时读取：页面已打开时（同路径导航不触发重挂载）也要即时消费。
  useEffect(() => {
    if (!pendingDispatch) return
    const dispatch = consumePendingDispatch()
    if (!dispatch) return
    selectOffice(dispatch.instanceId, dispatch.agentId)
    const store = useOpenClawChatStore.getState()
    void store
      .connect(dispatch.instanceId)
      .then(() => store.sendMessage(dispatch.instanceId, dispatch.agentId, dispatch.task))
  }, [pendingDispatch, consumePendingDispatch, selectOffice])

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

  // only 筛选同样随员工失效裁剪；裁剪为空即退出筛选（归一化为 null）。
  useEffect(() => {
    if (!onlyAgentIds) return
    const valid = onlyAgentIds.filter((id) => agentIds.includes(id))
    if (valid.length !== onlyAgentIds.length) setOnlyAgentIds(valid)
  }, [agentIds, onlyAgentIds, setOnlyAgentIds])

  // 打开新建会话面板：选中员工即创建会话。
  const openSessionPicker = useCallback((): void => {
    if (!selectedInstanceId || agents.length === 0) {
      toast.error(t("openclaw.noAgents"))
      return
    }
    setPickerKind("session")
  }, [agents.length, selectedInstanceId, t, toast])

  // 命令参数中的员工名 → 当前办公区员工（大小写不敏感）。
  const matchAgentsByName = useCallback(
    (names: string[]) =>
      agents.filter((agent) =>
        names.some((name) => name.toLowerCase() === agent.name.toLowerCase()),
      ),
    [agents],
  )

  // `/only` 命令行 → 视图筛选：参数文本是唯一来源，集合由员工名解析；全部不匹配返回 false。
  const applyOnlyFilter = useCallback(
    (args: string): boolean => {
      const names = splitCommandAgentNames(args)
      const matched = matchAgentsByName(names)
      if (names.length > 0 && matched.length === 0) return false
      setOnlyAgentIds(matched.map((agent) => agent.id))
      return true
    },
    [matchAgentsByName, setOnlyAgentIds],
  )

  const runCommand = useCallback(
    (command: OpenClawCommandId): void => {
      if (!selectedInstanceId) return
      const store = useOpenClawChatStore.getState()
      switch (command) {
        case "clear":
          // compose 面板由 `/clear` 输入文本派生（对齐 /model 二级面板），无需显式打开。
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
    [selectedInstanceId, sessions],
  )

  // 发送：命令优先；`@claw` 提及或选中集合决定扇出目标。
  const handleSend = useCallback((): void => {
    const text = input.trim()
    if (!text && files.length === 0) return
    // 多选面板下回车直发：发送前收起面板。
    setPickerKind(null)

    const command = parseOpenClawCommand(text)
    if (command) {
      if (command.id === "only") {
        const names = splitCommandAgentNames(command.args)
        // 无参数：`/only` 文本已派生员工选择面板，保持打开即可。
        if (names.length === 0) return
        if (!applyOnlyFilter(command.args)) toast.error(t("openclaw.sessionNoMatch"))
        setInput("")
        return
      }
      if (command.id === "clear") {
        const names = splitCommandAgentNames(command.args)
        if (names.length === 0) {
          // 无参数：`/clear` 文本已派生员工选择面板，保持打开即可。
          return
        }
        if (!selectedInstanceId) return
        const targets = matchAgentsByName(names)
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
    const { body: rawBody, agentIds: targets } = resolveClawDispatchTargets(
      text,
      agentIds,
      selectedAgentIds,
    )
    if (targets.length === 0) {
      toast.error(t("openclaw.noTarget"))
      return
    }
    const body = rawBody || (files.length > 0 ? formatAttachmentsOnlyMessage(files.length) : "")
    if (!body) {
      toast.error(t("agent.clawTaskRequired"))
      return
    }

    const pendingInput = input
    const pendingFiles = files
    setInput("")
    setFiles([])
    const store = useOpenClawChatStore.getState()
    const sends = targets.map((agentId) =>
      store.sendMessage(
        selectedInstanceId,
        agentId,
        body,
        pendingFiles.length > 0 ? pendingFiles : undefined,
      ),
    )
    void Promise.allSettled(sends).then((results) => {
      const failures = results.filter((result) => result.status === "rejected")
      for (const failure of failures) {
        const reason: unknown = failure.reason
        toast.error(
          reason instanceof Error && reason.message ? reason.message : t("openclaw.sendFailed"),
        )
      }
      // 全部目标失败（连接不可用、附件校验拒绝等）才回填输入与附件，避免部分成功后被重复发送。
      if (failures.length === results.length) {
        setInput((current) => (current ? current : pendingInput))
        setFiles((current) => (current.length > 0 ? current : pendingFiles))
      }
    })
  }, [
    agentIds,
    applyOnlyFilter,
    files,
    input,
    matchAgentsByName,
    runCommand,
    selectedAgentIds,
    selectedInstanceId,
    t,
    toast,
  ])

  const handleDeleteTurn = useCallback(
    (agentId: string, assistantMessageId: string): void => {
      if (!selectedInstanceId) return
      void useOpenClawChatStore
        .getState()
        .deleteTurn(selectedInstanceId, agentId, assistantMessageId)
        .then(() => {
          toast.success(t("openclaw.deleteTurnSuccess"))
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          toast.error(message || t("openclaw.deleteTurnFailed"))
        })
    },
    [selectedInstanceId, t, toast],
  )

  const picker = useMemo<OpenClawInputPicker | null>(() => {
    // compose 面板由输入文本派生（对齐 /model 二级面板）：`/clear` 即展示员工选择。
    const parsed = parseOpenClawCommand(input)
    if (parsed?.id === "only") {
      const onlyNameSet = new Set(
        splitCommandAgentNames(parsed.args).map((name) => name.toLowerCase()),
      )
      return {
        key: "only",
        commandId: "only",
        title: t("openclaw.onlyPickerTitle"),
        emptyText: t("openclaw.noAgents"),
        // 多选：空格切换即实时过滤，回车收尾（应用并清空输入）。
        multiSelect: true,
        items: [
          {
            id: PICKER_ALL_ID,
            label: t("openclaw.pickerAllAgents"),
            // 勾选态由「无筛选」派生：选中即显示全部。
            selected: onlyAgentIds === null,
          },
          ...timelineAgents.map((agent) => ({
            id: agent.id,
            label: agent.name,
            hint: agent.id,
            selected: onlyNameSet.has(agent.name.toLowerCase()),
          })),
        ],
        onPick: (id) => {
          if (id === PICKER_ALL_ID) {
            setInput("/only")
            applyOnlyFilter("")
            return
          }
          const agent = timelineAgents.find((item) => item.id === id)
          if (!agent) return
          const nextInput = toggleCommandAgentName(input, "only", agent.name)
          setInput(nextInput)
          applyOnlyFilter(parseOpenClawCommand(nextInput)?.args ?? "")
        },
      }
    }
    if (parsed?.id === "clear") {
      const clearNameSet = new Set(
        splitCommandAgentNames(parsed.args).map((name) => name.toLowerCase()),
      )
      const allClearSelected =
        timelineAgents.length > 0 &&
        timelineAgents.every((agent) => clearNameSet.has(agent.name.toLowerCase()))
      return {
        key: "session:compose",
        commandId: "clear",
        title: t("openclaw.sessionPickerTitle"),
        emptyText: t("openclaw.noAgents"),
        // 多选：空格切换员工，回车发送 `/clear` 命令。
        multiSelect: true,
        items: [
          {
            id: PICKER_ALL_ID,
            label: t("openclaw.pickerAllAgents"),
            selected: allClearSelected,
          },
          ...timelineAgents.map((agent) => ({
            id: agent.id,
            label: agent.name,
            hint: agent.id,
            selected: clearNameSet.has(agent.name.toLowerCase()),
          })),
        ],
        onPick: (id) => {
          if (id === PICKER_ALL_ID) {
            setInput((current) =>
              toggleAllCommandAgentNames(
                current,
                "clear",
                timelineAgents.map((agent) => agent.name),
              ),
            )
            return
          }
          const agent = timelineAgents.find((item) => item.id === id)
          if (!agent) return
          setInput((current) => toggleCommandAgentName(current, "clear", agent.name))
        },
      }
    }
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
      return {
        key: "session:execute",
        title: t("openclaw.sessionPickerTitle"),
        emptyText: t("openclaw.noAgents"),
        items: agents.map((agent) => ({
          id: agent.id,
          label: agent.name,
          hint: agent.id,
          selected: agent.id === activeAgentId,
        })),
        onPick: (id) => {
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
    applyOnlyFilter,
    enabledInstances,
    input,
    instances,
    onlyAgentIds,
    pickerKind,
    selectAgent,
    selectOffice,
    selectedInstanceId,
    t,
    timelineAgents,
    toast,
  ])

  const handleReconnect = (): void => {
    if (selectedInstanceId) void useOpenClawChatStore.getState().connect(selectedInstanceId)
  }

  return (
    <section className="openclaw-page-container flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {/* 顶部工具条：办公区标题、连接状态与操作 */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/5 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-white/80">
          <span className="shrink-0">{currentInstance?.name ?? t("nav.openclaw")}</span>
          {selectedAgents.length > 0 ? (
            <span className="min-w-0 truncate text-white/45">
              · {selectedAgents.map((agent) => agent.name).join(" · ")}
            </span>
          ) : null}
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

        {onlyAgentIds ? (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-white/45">
            <span className="shrink-0">{t("openclaw.onlyFilterLabel")}</span>
            <span className="flex min-w-0 items-center gap-1 overflow-hidden">
              {onlyAgentIds.map((agentId) => (
                <LxTag
                  key={agentId}
                  color="sky"
                  size="small"
                  confirmClose={false}
                  closeTooltipContent={t("openclaw.onlyFilterRemove")}
                  onClose={() => setOnlyAgentIds(onlyAgentIds.filter((id) => id !== agentId))}
                >
                  {agents.find((agent) => agent.id === agentId)?.name ?? agentId}
                </LxTag>
              ))}
            </span>
          </span>
        ) : null}

        <div className="flex-1" />

        <LxIconButton
          size="small"
          aria-label={t("openclaw.onlyFilterClear")}
          title={{ content: t("openclaw.onlyFilterClear"), placement: "bottom" }}
          disabled={onlyAgentIds === null}
          onClick={() => setOnlyAgentIds(null)}
        >
          <FilterX />
        </LxIconButton>
        <LxIconButton
          size="small"
          aria-label={t("openclaw.reconnect")}
          title={{ content: t("openclaw.reconnect"), placement: "bottom" }}
          disabled={!selectedInstanceId}
          onClick={handleReconnect}
        >
          <RefreshCw />
        </LxIconButton>
        <LxIconButton
          size="small"
          aria-label={t("openclaw.sessionNew")}
          title={{ content: t("openclaw.sessionNew"), placement: "bottom" }}
          disabled={!selectedInstanceId || agents.length === 0}
          onClick={openSessionPicker}
        >
          <Plus />
        </LxIconButton>
      </div>

      {/* 视图区：当前办公区内所有员工的消息合流时间线 */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <OpenClawMessageList
          timeline={visibleTimeline}
          agents={conversationAgents}
          isFiltered={onlyAgentIds !== null}
          onDeleteTurn={handleDeleteTurn}
        />
      </div>

      {/* 输入区：与消息列同宽（左侧 px-4，右侧额外预留消息列的滚动条占位） */}
      <div className="shrink-0 py-2 pl-4 pr-[calc(1rem_+_var(--lx-scrollbar-size))]">
        <div className="mx-auto w-full max-w-3xl">
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
            onlyCommandAvailable={onlyCommandAvailable}
            picker={picker}
            onPickerClose={() => setPickerKind(null)}
            placeholder={t("openclaw.placeholder")}
            disabled={agentIds.length === 0}
            isStreaming={isAnyStreaming}
            agents={agents}
            selectedAgentIds={selectedAgentIds}
            onToggleAgent={(agentId) => {
              selectAgent(agentId, { additive: true })
            }}
            files={files}
            onFilesChange={setFiles}
          />
        </div>
      </div>
    </section>
  )
}
