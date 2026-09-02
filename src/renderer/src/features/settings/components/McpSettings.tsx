import type { McpServerStatusItem } from "@shared/contracts/agent"
import type { McpServerConfig, McpSettings as McpSettingsType } from "@shared/settings"
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Edit2,
  FolderOpen,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxModal } from "@/components/ui/LxModal"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { settingsApi } from "../api/settingsApi"
import { settingsDirtyStore } from "../hooks/settingsDirtyStore"
import { notifySettingsChanged } from "../settingsChangeNotifier"

interface EnvRow {
  key: string
  value: string
}

export const McpSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [mcpSettings, setMcpSettings] = useState<McpSettingsType>({ servers: {} })
  const [initialSettings, setInitialSettings] = useState<McpSettingsType | null>(null)
  const [statuses, setStatuses] = useState<McpServerStatusItem[]>([])
  const [expandedToolsMap, setExpandedToolsMap] = useState<Record<string, boolean>>({})

  // Modal 弹窗状态
  const [modalOpen, setModalOpen] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [formName, setFormName] = useState("")
  const [formCommand, setFormCommand] = useState("")
  const [formArgs, setFormArgs] = useState("")
  const [formCwd, setFormCwd] = useState("")
  const [formEnvRows, setFormEnvRows] = useState<EnvRow[]>([])
  const [formDisabled, setFormDisabled] = useState(false)
  const [formTimeout, setFormTimeout] = useState("30000")
  const [formError, setFormError] = useState("")

  // 加载 MCP 配置与连接状态
  const loadData = useCallback(
    async (isManualRefresh = false) => {
      try {
        if (isManualRefresh) setRefreshing(true)
        else setLoading(true)

        const [settingsRes, statusRes] = await Promise.all([
          settingsApi.getMcpSettings(),
          window.api.agent.getMcpStatus(),
        ])

        setMcpSettings(settingsRes)
        setInitialSettings(JSON.parse(JSON.stringify(settingsRes)))
        setStatuses(statusRes)
      } catch (err) {
        console.error("[McpSettings] Failed to load MCP data:", err)
        toast.error(t("settings.loadSettingsFailed"))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [toast, t],
  )

  useEffect(() => {
    void loadData(false)
  }, [loadData])

  // 脏状态检查与注册
  const isDirty = useMemo(() => {
    if (!initialSettings) return false
    return JSON.stringify(mcpSettings) !== JSON.stringify(initialSettings)
  }, [mcpSettings, initialSettings])

  useEffect(() => {
    settingsDirtyStore.setSectionDirty("mcp", isDirty)
  }, [isDirty])

  useEffect(() => {
    const unregisterSave = settingsDirtyStore.registerSaveHandler("mcp", async () => {
      const saved = await settingsApi.saveMcpSettings(mcpSettings)
      setMcpSettings(saved)
      setInitialSettings(JSON.parse(JSON.stringify(saved)))
      settingsDirtyStore.setSectionDirty("mcp", false)
      notifySettingsChanged("mcp")
      // 刷新连接状态
      const statusRes = await window.api.agent.getMcpStatus()
      setStatuses(statusRes)
    })

    const unregisterReset = settingsDirtyStore.registerResetHandler("mcp", () => {
      if (initialSettings) {
        setMcpSettings(JSON.parse(JSON.stringify(initialSettings)))
      }
      settingsDirtyStore.setSectionDirty("mcp", false)
    })

    return () => {
      unregisterSave()
      unregisterReset()
    }
  }, [mcpSettings, initialSettings])

  // 开启添加弹窗
  const handleOpenAdd = () => {
    setEditingKey(null)
    setFormName("")
    setFormCommand("")
    setFormArgs("")
    setFormCwd("")
    setFormEnvRows([])
    setFormDisabled(false)
    setFormTimeout("30000")
    setFormError("")
    setModalOpen(true)
  }

  // 开启编辑弹窗
  const handleOpenEdit = (key: string, config: McpServerConfig) => {
    setEditingKey(key)
    setFormName(key)
    const [cmd, ...args] = config.command || []
    setFormCommand(cmd || "")
    setFormArgs(args.join(" "))
    setFormCwd(config.cwd || "")
    const envRows: EnvRow[] = Object.entries(config.environment || {}).map(([k, v]) => ({
      key: k,
      value: v,
    }))
    setFormEnvRows(envRows)
    setFormDisabled(Boolean(config.disabled))
    setFormTimeout(String(config.timeout ?? 30000))
    setFormError("")
    setModalOpen(true)
  }

  // 保存表单数据
  const handleSaveModal = () => {
    const trimmedName = formName.trim()
    const trimmedCommand = formCommand.trim()

    if (!trimmedName) {
      setFormError(t("settings.mcpNameRequired"))
      return
    }
    if (!trimmedCommand) {
      setFormError(t("settings.mcpCommandRequired"))
      return
    }

    if (!editingKey && mcpSettings.servers[trimmedName]) {
      setFormError(t("settings.mcpNameDuplicate"))
      return
    }

    const commandArray = [
      trimmedCommand,
      ...formArgs
        .split(" ")
        .map((s) => s.trim())
        .filter(Boolean),
    ]

    const environment: Record<string, string> = {}
    for (const row of formEnvRows) {
      if (row.key.trim()) {
        environment[row.key.trim()] = row.value
      }
    }

    const timeoutNum = Number.parseInt(formTimeout, 10)
    const timeout = Number.isFinite(timeoutNum) && timeoutNum > 0 ? timeoutNum : 30000

    const newConfig: McpServerConfig = {
      command: commandArray,
      ...(formCwd.trim() ? { cwd: formCwd.trim() } : {}),
      ...(Object.keys(environment).length > 0 ? { environment } : {}),
      ...(formDisabled ? { disabled: true } : {}),
      timeout,
    }

    setMcpSettings((prev) => {
      const nextServers = { ...prev.servers }
      if (editingKey && editingKey !== trimmedName) {
        delete nextServers[editingKey]
      }
      nextServers[trimmedName] = newConfig
      return { servers: nextServers }
    })

    setModalOpen(false)
  }

  // 删除 Server
  const handleDeleteServer = (key: string) => {
    setMcpSettings((prev) => {
      const nextServers = { ...prev.servers }
      delete nextServers[key]
      return { servers: nextServers }
    })
    toast.success(t("settings.mcpDeleteSuccess", { name: key }))
  }

  // 切换禁用开关
  const handleToggleDisabled = (key: string, checked: boolean) => {
    setMcpSettings((prev) => {
      const target = prev.servers[key]
      if (!target) return prev
      return {
        servers: {
          ...prev.servers,
          [key]: {
            ...target,
            disabled: !checked,
          },
        },
      }
    })
  }

  // 重连全部
  const handleReconnectAll = async () => {
    setRefreshing(true)
    try {
      await settingsApi.reconnectMcp()
      const statusRes = await window.api.agent.getMcpStatus()
      setStatuses(statusRes)
      toast.success(t("settings.mcpReconnectSuccess"))
    } catch (err) {
      console.error("[McpSettings] Reconnect failed:", err)
      toast.error(t("settings.mcpReconnectFailed"))
    } finally {
      setRefreshing(false)
    }
  }

  // 过滤后的列表
  const serverEntries = useMemo(() => {
    const list = Object.entries(mcpSettings.servers)
    const q = searchQuery.toLowerCase().trim()
    if (!q) return list
    return list.filter(([name, conf]) => {
      return (
        name.toLowerCase().includes(q) ||
        conf.command.join(" ").toLowerCase().includes(q) ||
        conf.cwd?.toLowerCase().includes(q)
      )
    })
  }, [mcpSettings.servers, searchQuery])

  // 状态映射表
  const statusMap = useMemo(() => {
    const map = new Map<string, McpServerStatusItem>()
    for (const st of statuses) {
      map.set(st.name, st)
    }
    return map
  }, [statuses])

  if (loading && Object.keys(mcpSettings.servers).length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("settings.loadingSettings")}
      </div>
    )
  }

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
      {/* 顶部搜索、重连与添加按钮 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 max-w-xs">
          <LxInput
            size="sm"
            prefix={<Search className="h-3.5 w-3.5 text-white/40" />}
            placeholder={t("settings.mcpSearchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clear
            onClear={() => setSearchQuery("")}
          />
        </div>

        <div className="flex items-center gap-2">
          <LxIconButton
            preset="default"
            aria-label={t("settings.mcpReconnectAll")}
            title={{ content: t("settings.mcpReconnectAll"), placement: "left" }}
            disabled={refreshing}
            onClick={() => void handleReconnectAll()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-white" : ""}`} />
          </LxIconButton>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 rounded-[6px] border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/75 hover:border-white/20 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t("settings.mcpAddServer")}</span>
          </button>
        </div>
      </div>

      {/* 提示信息说明与文档 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        <div className="flex items-center gap-2">
          <span>{t("settings.mcpExplanation")}</span>
          <LxInfoTooltip markdown={t("settings.mcpDoc")} placement="right" />
        </div>
      </div>

      {/* MCP 服务卡片列表 */}
      <div className="grid grid-cols-1 gap-2.5">
        {serverEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-xs text-white/40 border border-dashed border-white/10 rounded-[6px]">
            <span>{searchQuery ? t("settings.mcpNoMatches") : t("settings.mcpNoServers")}</span>
            {!searchQuery && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="flex items-center gap-1 rounded-[6px] border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/75 hover:border-white/20 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t("settings.mcpAddServer")}</span>
              </button>
            )}
          </div>
        ) : (
          serverEntries.map(([name, config]) => {
            const statusItem = statusMap.get(name)
            const isConfigDisabled = Boolean(config.disabled)
            const isConnected = !isConfigDisabled && statusItem?.status === "connected"
            const isFailed = !isConfigDisabled && statusItem?.status === "failed"
            const isExpandedTools = expandedToolsMap[name] || false
            const tools = statusItem?.tools || []
            const toolsCount = statusItem?.toolsCount ?? tools.length

            return (
              <div
                key={name}
                className="settings-item-card group relative flex flex-col gap-2.5 rounded-[6px] border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
              >
                {/* 标题栏：身份、状态徽标与右侧操作 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05] text-white/80">
                      <Plug
                        className={`h-4 w-4 ${isConnected ? "text-emerald-400" : isFailed ? "text-red-400" : "text-white/40"}`}
                      />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-white/90">{name}</span>
                        {isConfigDisabled ? (
                          <LxTag size="small" color="gray">
                            {t("settings.disabled")}
                          </LxTag>
                        ) : isConnected ? (
                          <LxTag size="small" color="emerald" prefix={<Plug className="h-3 w-3" />}>
                            {t("settings.mcpConnected")}
                          </LxTag>
                        ) : isFailed ? (
                          <LxTooltip
                            content={statusItem?.error || t("settings.mcpFailed")}
                            placement="top"
                          >
                            <span className="inline-flex">
                              <LxTag
                                size="small"
                                color="rose"
                                prefix={<AlertTriangle className="h-3 w-3" />}
                              >
                                {t("settings.mcpFailed")}
                              </LxTag>
                            </span>
                          </LxTooltip>
                        ) : (
                          <LxTag size="small" color="gray">
                            {t("settings.mcpConnecting")}
                          </LxTag>
                        )}
                        {toolsCount > 0 && (
                          <LxTag size="small" color="sky" prefix={<Wrench className="h-3 w-3" />}>
                            {toolsCount} {t("settings.mcpTools")}
                          </LxTag>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧操作按钮 */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    <LxIconButton
                      preset="default"
                      size="small"
                      onClick={() => handleOpenEdit(name, config)}
                      title={{ content: t("settings.edit"), placement: "top" }}
                      aria-label={t("settings.edit")}
                    >
                      <Edit2 className="h-3.5 w-3.5 text-white/70" />
                    </LxIconButton>

                    <LxIconButton
                      preset="default"
                      size="small"
                      onClick={() => handleDeleteServer(name)}
                      title={{ content: t("settings.delete"), placement: "top" }}
                      aria-label={t("settings.delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-400/80 hover:text-red-400" />
                    </LxIconButton>

                    <div className="h-3.5 w-px bg-white/10" />

                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white/70">
                      <LxCheckbox
                        checked={!isConfigDisabled}
                        onChange={(checked) => handleToggleDisabled(name, checked)}
                      />
                      <span>{t("settings.enable")}</span>
                    </label>
                  </div>
                </div>

                {/* 失败错误提示信息 */}
                {isFailed && statusItem?.error && (
                  <div className="flex items-start gap-1.5 rounded-[4px] bg-red-500/10 p-2 text-xs text-red-300">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span className="break-all">{statusItem.error}</span>
                  </div>
                )}

                {/* 命令与参数展示 */}
                <div className="flex flex-col gap-1 text-xs text-white/60">
                  <div className="flex items-center gap-1.5 overflow-x-auto">
                    <span className="shrink-0 text-white/40">{t("settings.mcpCommand")}:</span>
                    <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-white/80 select-all">
                      {config.command.join(" ")}
                    </code>
                  </div>

                  {config.cwd && (
                    <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                      <FolderOpen className="h-3 w-3" />
                      <span>{config.cwd}</span>
                    </div>
                  )}

                  {config.environment && Object.keys(config.environment).length > 0 && (
                    <div className="text-[11px] text-white/40">
                      <span>
                        {t("settings.mcpEnvCount", {
                          count: Object.keys(config.environment).length,
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* 工具列表抽屉 */}
                {tools.length > 0 && (
                  <div className="border-t border-white/5 pt-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedToolsMap((prev) => ({ ...prev, [name]: !prev[name] }))
                      }
                      className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors cursor-pointer"
                    >
                      {isExpandedTools ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      <span>{t("settings.mcpRegisteredTools", { count: tools.length })}</span>
                    </button>

                    {isExpandedTools && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 rounded-[6px] bg-black/20 p-2 border border-white/5">
                        {tools.map((toolName) => (
                          <span
                            key={toolName}
                            className="rounded-[4px] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] text-white/70"
                          >
                            {toolName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* 新增 / 编辑 MCP Server 模态框 */}
      <LxModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingKey ? t("settings.mcpEditServer") : t("settings.mcpAddServer")}
        width="520px"
      >
        <div className="flex flex-col gap-3.5 p-1 text-xs text-white/80">
          {formError && (
            <div className="flex items-center gap-1.5 rounded-[4px] bg-red-500/15 p-2 text-xs text-red-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* 名称 */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.mcpServerName")} *</span>
            <LxInput
              size="sm"
              placeholder="e.g. filesystem"
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value)
                setFormError("")
              }}
              disabled={Boolean(editingKey)}
            />
          </div>

          {/* 可执行命令 */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">
              {t("settings.mcpExecutableCommand")} *
            </span>
            <LxInput
              size="sm"
              placeholder="e.g. npx or /usr/local/bin/node"
              value={formCommand}
              onChange={(e) => {
                setFormCommand(e.target.value)
                setFormError("")
              }}
            />
          </div>

          {/* 命令参数 */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.mcpArgs")}</span>
            <LxInput
              size="sm"
              placeholder="e.g. -y @modelcontextprotocol/server-filesystem /path"
              value={formArgs}
              onChange={(e) => setFormArgs(e.target.value)}
            />
          </div>

          {/* 工作目录 */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.mcpCwd")}</span>
            <LxInput
              size="sm"
              placeholder={t("settings.mcpCwdPlaceholder")}
              value={formCwd}
              onChange={(e) => setFormCwd(e.target.value)}
            />
          </div>

          {/* 环境变量 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium text-white/70">{t("settings.mcpEnvironment")}</span>
              <button
                type="button"
                onClick={() => setFormEnvRows((prev) => [...prev, { key: "", value: "" }])}
                className="flex items-center gap-1 text-[11px] text-white/60 hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>{t("settings.mcpAddEnvRow")}</span>
              </button>
            </div>

            {formEnvRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <LxInput
                  size="sm"
                  placeholder="KEY"
                  value={row.key}
                  onChange={(e) => {
                    const next = [...formEnvRows]
                    next[idx].key = e.target.value
                    setFormEnvRows(next)
                  }}
                  className="flex-1"
                />
                <LxInput
                  size="sm"
                  placeholder="VALUE"
                  value={row.value}
                  onChange={(e) => {
                    const next = [...formEnvRows]
                    next[idx].value = e.target.value
                    setFormEnvRows(next)
                  }}
                  className="flex-1"
                />
                <LxIconButton
                  preset="default"
                  size="small"
                  onClick={() => {
                    setFormEnvRows((prev) => prev.filter((_, i) => i !== idx))
                  }}
                  title={{ content: t("settings.delete"), placement: "top" }}
                  aria-label={t("settings.delete")}
                >
                  <X className="h-3.5 w-3.5 text-white/50" />
                </LxIconButton>
              </div>
            ))}
          </div>

          {/* 超时时间 */}
          <div className="flex flex-col gap-1">
            <span className="font-medium text-white/70">{t("settings.mcpTimeout")}</span>
            <LxInput
              size="sm"
              placeholder="30000"
              value={formTimeout}
              onChange={(e) => setFormTimeout(e.target.value)}
            />
          </div>

          {/* 底部按钮栏 */}
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-[6px] border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 transition-colors cursor-pointer"
            >
              {t("settings.cancel")}
            </button>
            <button
              type="button"
              onClick={handleSaveModal}
              className="rounded-[6px] border border-white/15 bg-white/[0.08] px-3.5 py-1.5 text-xs font-medium text-white hover:bg-white/[0.12] transition-colors cursor-pointer"
            >
              {t("settings.confirm")}
            </button>
          </div>
        </div>
      </LxModal>
    </div>
  )
}
