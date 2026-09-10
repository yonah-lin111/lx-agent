import type {
  OpenClawAgentItem,
  OpenClawAuthMode,
  OpenClawInstanceConfig,
  OpenClawSettings as OpenClawSettingsConfig,
} from "@shared/settings"
import { DEFAULT_OPENCLAW_GATEWAY_URL } from "@shared/settings"
import { Loader2, Network, Plug, RefreshCw, Trash2 } from "lucide-react"
import type React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { type TranslationKey, useTranslation } from "@/i18n"

// 生成一个未被占用的实例 id。
const createInstanceId = (instances: Record<string, OpenClawInstanceConfig>): string => {
  let index = 1
  while (instances[`openclaw-${index}`]) index += 1
  return `openclaw-${index}`
}

// 将已存在的实例 id 重命名，保持键顺序不变。
const renameInstance = (
  instances: Record<string, OpenClawInstanceConfig>,
  from: string,
  to: string,
): Record<string, OpenClawInstanceConfig> => {
  const next: Record<string, OpenClawInstanceConfig> = {}
  for (const [key, value] of Object.entries(instances)) {
    next[key === from ? to : key] = value
  }
  return next
}

const AUTH_MODE_OPTIONS: { value: OpenClawAuthMode; labelKey: TranslationKey }[] = [
  { value: "token", labelKey: "settings.openclawAuthModeToken" },
  { value: "device", labelKey: "settings.openclawAuthModeDevice" },
]

/**
 * 渲染 OpenClaw 实例与 Agent 配置分区。
 */
export const OpenClawSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<OpenClawSettingsConfig>({ instances: {} })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [idDraft, setIdDraft] = useState("")
  const [fetchingId, setFetchingId] = useState<string | null>(null)

  const baselineRef = useRef<string | null>(null)

  const isDirty = useMemo(() => {
    if (baselineRef.current === null) return false
    return JSON.stringify(settings) !== baselineRef.current
  }, [settings])

  const handleSave = useCallback(async (): Promise<void> => {
    const saved = await settingsApi.saveOpenClawSettings(settings)
    setSettings(saved)
    baselineRef.current = JSON.stringify(saved)
    notifySettingsChanged("openclaw")
  }, [settings])

  const handleReset = useCallback((): void => {
    if (baselineRef.current !== null) {
      setSettings(JSON.parse(baselineRef.current))
    }
  }, [])

  useRegisterSettingsSection({
    section: "openclaw",
    isDirty,
    onSave: handleSave,
    onReset: handleReset,
  })

  const loadData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const loaded = await settingsApi.getOpenClawSettings()
      setSettings(loaded)
      if (baselineRef.current === null) baselineRef.current = JSON.stringify(loaded)
      const firstId = Object.keys(loaded.instances)[0] ?? null
      setSelectedId((current) => current ?? firstId)
    } catch (error) {
      console.error("[OpenClawSettings] Failed to load settings:", error)
      toast.error(t("settings.loadSettingsFailed"))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const instanceIds = useMemo(() => Object.keys(settings.instances), [settings.instances])
  const selected = selectedId ? settings.instances[selectedId] : undefined

  useEffect(() => {
    setIdDraft(selectedId ?? "")
  }, [selectedId])

  // 局部更新当前选中实例。
  const updateSelected = (patch: Partial<OpenClawInstanceConfig>): void => {
    if (!selectedId) return
    setSettings((current) => {
      const instance = current.instances[selectedId]
      if (!instance) return current
      return {
        ...current,
        instances: { ...current.instances, [selectedId]: { ...instance, ...patch } },
      }
    })
  }

  const handleAddInstance = (): void => {
    const id = createInstanceId(settings.instances)
    setSettings((current) => ({
      instances: {
        ...current.instances,
        [id]: {
          name: t("settings.openclawInstanceNamePlaceholder"),
          gatewayUrl: DEFAULT_OPENCLAW_GATEWAY_URL,
          authMode: "token",
          enabled: true,
          agents: [],
        },
      },
    }))
    setSelectedId(id)
  }

  const handleDeleteInstance = (id: string): void => {
    setSettings((current) => {
      const instances = { ...current.instances }
      delete instances[id]
      return { ...current, instances }
    })
    setSelectedId((current) => {
      if (current !== id) return current
      return Object.keys(settings.instances).find((candidate) => candidate !== id) ?? null
    })
  }

  // 提交实例 id 重命名（空或重复则回滚为原值）。
  const commitInstanceId = (): void => {
    if (!selectedId) return
    const next = idDraft.trim()
    if (!next || next === selectedId) {
      setIdDraft(selectedId)
      return
    }
    if (settings.instances[next]) {
      toast.error(t("settings.openclawInvalidId"))
      setIdDraft(selectedId)
      return
    }
    setSettings((current) => ({
      ...current,
      instances: renameInstance(current.instances, selectedId, next),
      ...(current.defaultInstanceId === selectedId ? { defaultInstanceId: next } : {}),
    }))
    setSelectedId(next)
  }

  const handleFetchAgents = async (id: string): Promise<void> => {
    setFetchingId(id)
    try {
      const result = await window.api.openclaw.fetchAgents(id)
      if (result.status !== "connected" && result.status !== "error") {
        toast.error(result.error || t("settings.openclawFetchAgentsFailed"))
        return
      }
      if (result.status === "error") {
        toast.error(result.error || t("settings.openclawFetchAgentsFailed"))
        return
      }
      const agents: OpenClawAgentItem[] = result.agents
      setSettings((current) => {
        const instance = current.instances[id]
        if (!instance) return current
        return {
          ...current,
          instances: { ...current.instances, [id]: { ...instance, agents } },
        }
      })
      toast.success(t("settings.openclawFetchAgentsSuccess", { count: agents.length }))
    } catch (error) {
      console.error("[OpenClawSettings] Failed to fetch agents:", error)
      toast.error(t("settings.openclawFetchAgentsFailed"))
    } finally {
      setFetchingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("settings.loadingSettings")}
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      {/* 左侧实例列表 */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/5">
        <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
          <span className="text-xs font-medium text-white/70">
            {t("settings.openclawInstances")}
          </span>
          <LxIconButton
            preset="add"
            size="small"
            aria-label={t("settings.openclawAddInstance")}
            title={{ content: t("settings.openclawAddInstance"), placement: "bottom" }}
            onClick={handleAddInstance}
          />
        </div>
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-1.5">
          {instanceIds.length === 0 ? (
            <p className="px-2 py-3 text-xs text-white/45">{t("settings.openclawEmptyState")}</p>
          ) : (
            instanceIds.map((id) => {
              const instance = settings.instances[id]
              if (!instance) return null
              const isActive = id === selectedId
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedId(id)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left transition-colors ${
                    isActive
                      ? "border-white/10 bg-white/[0.06]"
                      : "border-transparent hover:bg-white/[0.03]"
                  }`}
                >
                  <Network
                    className={`h-3.5 w-3.5 shrink-0 ${
                      instance.enabled ? "text-sky-400" : "text-white/30"
                    }`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-white/80">{instance.name}</span>
                    <span className="block truncate text-[10px] text-white/40">{id}</span>
                  </span>
                  <LxTag size="small">{instance.agents.length}</LxTag>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* 右侧实例详情 */}
      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-3">
        <div className="mb-3 flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
          <div className="flex items-center gap-2">
            <span>{t("settings.openclawDesc")}</span>
            <LxInfoTooltip markdown={t("settings.openclawDoc")} placement="right" />
          </div>
        </div>

        {!selected ? (
          <p className="px-1 py-6 text-center text-xs text-white/45">
            {t("settings.openclawEmptyState")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="settings-item-card rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/60">
                    {t("settings.openclawInstanceName")}
                  </span>
                  <LxInput
                    value={selected.name}
                    placeholder={t("settings.openclawInstanceNamePlaceholder")}
                    onChange={(event) => updateSelected({ name: event.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/60">{t("settings.openclawInstanceId")}</span>
                  <LxInput
                    value={idDraft}
                    placeholder={t("settings.openclawInstanceIdPlaceholder")}
                    onChange={(event) => setIdDraft(event.target.value)}
                    onBlur={commitInstanceId}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/60">{t("settings.openclawGatewayUrl")}</span>
                  <LxInput
                    value={selected.gatewayUrl}
                    placeholder={DEFAULT_OPENCLAW_GATEWAY_URL}
                    onChange={(event) => updateSelected({ gatewayUrl: event.target.value })}
                  />
                </label>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-white/60">{t("settings.openclawAuthMode")}</span>
                  <LxSelect
                    value={selected.authMode}
                    options={AUTH_MODE_OPTIONS.map((option) => ({
                      value: option.value,
                      label: t(option.labelKey),
                    }))}
                    onChange={(value) => updateSelected({ authMode: value })}
                  />
                </div>

                {selected.authMode === "token" ? (
                  <label className="flex flex-col gap-1.5 lg:col-span-2">
                    <span className="text-xs text-white/60">{t("settings.openclawToken")}</span>
                    <LxInput
                      value={selected.token ?? ""}
                      placeholder={t("settings.openclawTokenPlaceholder")}
                      onChange={(event) => updateSelected({ token: event.target.value })}
                    />
                  </label>
                ) : null}

                <div className="flex items-center gap-2 lg:col-span-2">
                  <LxCheckbox
                    checked={selected.enabled}
                    onChange={(checked) => updateSelected({ enabled: checked })}
                  />
                  <span className="text-xs text-white/60">{t("settings.openclawEnabled")}</span>
                </div>
              </div>
            </div>

            {/* Agent 列表 */}
            <div className="settings-item-card rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Plug className="h-3.5 w-3.5 text-white/50" />
                  <span className="text-xs font-medium text-white/80">
                    {t("settings.openclawAgents")}
                  </span>
                  <LxTag size="small">
                    {t("settings.openclawAgentCount", { count: selected.agents.length })}
                  </LxTag>
                </div>
                <LxIconButton
                  size="small"
                  aria-label={t("settings.openclawFetchAgents")}
                  title={{ content: t("settings.openclawFetchAgents"), placement: "top" }}
                  disabled={fetchingId === selectedId}
                  onClick={() => {
                    if (selectedId) void handleFetchAgents(selectedId)
                  }}
                >
                  {fetchingId === selectedId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                </LxIconButton>
              </div>

              {selected.agents.length === 0 ? (
                <p className="px-1 py-2 text-xs text-white/45">{t("settings.openclawNoAgents")}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selected.agents.map((agent) => (
                    <LxTag key={agent.id} size="small" color="sky">
                      {agent.name}
                    </LxTag>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <LxIconButton
                preset="delete"
                size="small"
                aria-label={t("settings.openclawDeleteInstance")}
                title={{
                  content: t("settings.openclawDeleteConfirm"),
                  placement: "top",
                  onConfirm: () => {
                    if (selectedId) handleDeleteInstance(selectedId)
                  },
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </LxIconButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
