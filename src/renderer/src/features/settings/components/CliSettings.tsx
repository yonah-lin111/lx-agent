import type { CliId, CliSettings as CliSettingsType, CliVersionInfo } from "@shared/settings"
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react"

import { useCallback, useEffect, useMemo, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"
import { settingsApi } from "../api/settingsApi"
import { settingsDirtyStore } from "../hooks/settingsDirtyStore"
import { notifySettingsChanged } from "../settingsChangeNotifier"
import { CliIcon } from "./CliIcon"

export const CliSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [cliSettings, setCliSettings] = useState<CliSettingsType>({ enabled: [], customPaths: {} })
  const [initialSettings, setInitialSettings] = useState<CliSettingsType | null>(null)
  const [versions, setVersions] = useState<CliVersionInfo[]>([])
  const [operatingMap, setOperatingMap] = useState<
    Record<string, "install" | "update" | undefined>
  >({})
  const [showCustomPathMap, setShowCustomPathMap] = useState<Record<string, boolean>>({})

  // 加载配置与版本列表
  const loadData = useCallback(
    async (force = false) => {
      try {
        if (force) setRefreshing(true)
        else setLoading(true)

        const [settingsRes, versionsRes] = await Promise.all([
          settingsApi.getCliSettings(),
          settingsApi.getCliVersions({ force }),
        ])

        setCliSettings(settingsRes)
        setInitialSettings(JSON.parse(JSON.stringify(settingsRes)))
        setVersions(versionsRes)
      } catch (err) {
        console.error("[CliSettings] Failed to load CLI data:", err)
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

  // 脏状态比对与注册
  const isDirty = useMemo(() => {
    if (!initialSettings) return false
    return JSON.stringify(cliSettings) !== JSON.stringify(initialSettings)
  }, [cliSettings, initialSettings])

  useEffect(() => {
    settingsDirtyStore.setSectionDirty("cli", isDirty)
  }, [isDirty])

  useEffect(() => {
    const unregisterSave = settingsDirtyStore.registerSaveHandler("cli", async () => {
      const saved = await settingsApi.saveCliSettings(cliSettings)
      setCliSettings(saved)
      setInitialSettings(JSON.parse(JSON.stringify(saved)))
      settingsDirtyStore.setSectionDirty("cli", false)
      notifySettingsChanged("cli")
    })

    const unregisterReset = settingsDirtyStore.registerResetHandler("cli", () => {
      if (initialSettings) {
        setCliSettings(JSON.parse(JSON.stringify(initialSettings)))
      }
      settingsDirtyStore.setSectionDirty("cli", false)
    })

    return () => {
      unregisterSave()
      unregisterReset()
    }
  }, [cliSettings, initialSettings])

  // 切换启用开关
  const handleToggleEnabled = (cliId: CliId, checked: boolean) => {
    setCliSettings((prev) => {
      const current = new Set(prev.enabled)
      if (checked) {
        current.add(cliId)
      } else {
        current.delete(cliId)
      }
      return {
        ...prev,
        enabled: Array.from(current),
      }
    })
  }

  // 修改自定义路径
  const handleCustomPathChange = (cliId: CliId, path: string) => {
    setCliSettings((prev) => ({
      ...prev,
      customPaths: {
        ...prev.customPaths,
        [cliId]: path.trim(),
      },
    }))
  }

  // 执行安装或升级
  const handleRunAction = async (cliId: CliId, action: "install" | "update", cliName: string) => {
    setOperatingMap((prev) => ({ ...prev, [cliId]: action }))
    try {
      const res = await settingsApi.runCliLifecycleAction(cliId, action)
      if (res.success) {
        toast.success(
          action === "install"
            ? t("settings.cliInstallSuccess", { name: cliName })
            : t("settings.cliUpdateSuccess", { name: cliName }),
        )
        // 刷新版本状态
        const updatedVersions = await settingsApi.getCliVersions({ force: true })
        setVersions(updatedVersions)
      } else {
        toast.error(res.message || t("settings.cliActionFailed"))
      }
    } catch (err) {
      console.error(`[CliSettings] Action ${action} failed:`, err)
      toast.error(t("settings.cliActionFailed"))
    } finally {
      setOperatingMap((prev) => ({ ...prev, [cliId]: undefined }))
    }
  }

  // 复制安装命令
  const handleCopyInstallCommand = async (cliId: CliId) => {
    const defaultCommands: Record<CliId, string> = {
      claude: "npm i -g @anthropic-ai/claude-code@latest",
      codex: "npm i -g @openai/codex@latest",
      gemini: "npm i -g @google/gemini-cli@latest",
      opencode: "npm i -g opencode-ai@latest",
      agy: "npm i -g @google/antigravity@latest",
      grok: "npm i -g @xai-official/grok@latest",
    }
    const cmd = defaultCommands[cliId] || `npm i -g ${cliId}@latest`

    try {
      await navigator.clipboard.writeText(cmd)
      toast.success(t("settings.cliCopyInstallCommandSuccess"))
    } catch {
      toast.error(t("agent.copyFailed"))
    }
  }

  // 打开官网
  const handleOpenHomepage = (url?: string) => {
    if (url) {
      window.open(url, "_blank")
    }
  }

  const filteredVersions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return versions
    return versions.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.displayName.toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q),
    )
  }, [versions, searchQuery])

  if (loading && versions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        {t("settings.loadingSettings")}
      </div>
    )
  }

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
      {/* 顶部搜索与刷新工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 max-w-xs">
          <LxInput
            size="sm"
            prefix={<Search className="h-3.5 w-3.5 text-white/40" />}
            placeholder={t("settings.cliSearchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clear
            onClear={() => setSearchQuery("")}
          />
        </div>
        <LxIconButton
          preset="default"
          aria-label={t("settings.cliRefresh")}
          title={{ content: t("settings.cliRefresh"), placement: "left" }}
          disabled={refreshing}
          onClick={() => void loadData(true)}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-white" : ""}`} />
        </LxIconButton>
      </div>

      {/* CLI 列表展示卡片 */}
      <div className="grid grid-cols-1 gap-2.5">
        {filteredVersions.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-white/30">
            {t("settings.cliNoMatches")}
          </div>
        ) : (
          filteredVersions.map((tool) => {
            const isEnabled = cliSettings.enabled.includes(tool.id)
            const operating = operatingMap[tool.id]
            const isCustomPathOpen = showCustomPathMap[tool.id]
            const currentCustomPath = cliSettings.customPaths?.[tool.id] || ""
            const displayCommand = tool.command || tool.name

            return (
              <div
                key={tool.id}
                className="settings-item-card group relative flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
              >
                {/* 第 1 行：工具身份与状态徽标 / 启用开关 */}
                <div className="flex items-center justify-between gap-2">
                  {/* 左侧：图标 + 工具名 + 命令名 + 官网链接 */}
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="settings-cli-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-white/5 text-white/70">
                      <CliIcon id={tool.id} className="h-3.5 w-3.5" />
                    </div>
                    <span className="truncate text-sm font-medium text-white">
                      {tool.displayName}
                    </span>

                    <code className="settings-cli-command shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-white/40">
                      {displayCommand}
                    </code>
                    {tool.homepage ? (
                      <LxTooltip content={t("settings.cliHomepage")} placement="top">
                        <button
                          type="button"
                          className="shrink-0 text-white/30 transition-colors hover:text-white/70"
                          onClick={() => handleOpenHomepage(tool.homepage)}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </LxTooltip>
                    ) : null}
                  </div>

                  {/* 右侧：状态徽标 + 启用开关 */}
                  <div className="flex shrink-0 items-center gap-2">
                    {tool.installedButBroken ? (
                      <LxTag
                        color="amber"
                        size="small"
                        prefix={<AlertTriangle className="h-2.5 w-2.5" />}
                      >
                        {t("settings.cliBroken")}
                      </LxTag>
                    ) : tool.installed ? (
                      tool.hasUpdate ? (
                        <LxTag
                          color="purple"
                          size="small"
                          prefix={<ArrowUpCircle className="h-2.5 w-2.5" />}
                        >
                          {t("settings.cliHasUpdate")}: {tool.version} → {tool.latestVersion}
                        </LxTag>
                      ) : (
                        <LxTag
                          color="emerald"
                          size="small"
                          prefix={<CheckCircle2 className="h-2.5 w-2.5" />}
                        >
                          {t("settings.cliInstalled")} (v{tool.version})
                        </LxTag>
                      )
                    ) : (
                      <LxTag color="gray" size="small" prefix={<XCircle className="h-2.5 w-2.5" />}>
                        {t("settings.cliNotInstalled")}
                      </LxTag>
                    )}

                    <LxTooltip
                      content={!tool.installed ? t("settings.cliMustInstallToEnable") : undefined}
                      placement="top"
                    >
                      <div className="settings-card-divider-v flex items-center gap-1.5 border-l border-white/8 pl-2">
                        <LxCheckbox
                          id={`cli-enable-${tool.id}`}
                          checked={isEnabled && Boolean(tool.installed)}
                          disabled={!tool.installed}
                          onChange={(checked) => {
                            if (!tool.installed) return
                            handleToggleEnabled(tool.id, checked)
                          }}
                        />
                        <label
                          htmlFor={`cli-enable-${tool.id}`}
                          className={`select-none whitespace-nowrap text-xs ${
                            !tool.installed
                              ? "cursor-not-allowed text-white/25"
                              : "cursor-pointer text-white/60 hover:text-white"
                          }`}
                        >
                          {t("settings.cliEnableInSendPrompt")}
                        </label>
                      </div>
                    </LxTooltip>
                  </div>
                </div>

                {/* 第 2 行：路径信息与操作按钮 */}
                <div className="settings-card-divider flex items-center justify-between gap-3 border-t border-white/[0.04] pt-2">
                  {/* 左侧：可执行路径或错误信息 */}
                  <div className="min-w-0 flex-1">
                    {tool.path ? (
                      <p className="truncate font-mono text-[11px] text-white/35" title={tool.path}>
                        {tool.path}
                      </p>
                    ) : (
                      <p className="truncate text-[11px] text-white/25">
                        {tool.error || t("settings.cliNotInstalled")}
                      </p>
                    )}
                  </div>

                  {/* 右侧：安装 / 升级 / 复制 / 自定义路径操作按钮 */}
                  <div className="flex shrink-0 items-center gap-1">
                    {tool.hasUpdate ? (
                      <button
                        type="button"
                        disabled={Boolean(operating)}
                        className="settings-cli-action-btn flex h-5.5 items-center gap-1 rounded bg-purple-500/20 px-2 text-[11px] font-medium text-purple-300 transition-colors hover:bg-purple-500/30 disabled:opacity-50"
                        onClick={() => void handleRunAction(tool.id, "update", tool.displayName)}
                      >
                        {operating === "update" ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <ArrowUpCircle className="h-2.5 w-2.5" />
                        )}
                        <span>
                          {operating === "update"
                            ? t("settings.cliUpdating")
                            : t("settings.cliUpdate")}
                        </span>
                      </button>
                    ) : !tool.installed ? (
                      <button
                        type="button"
                        disabled={Boolean(operating)}
                        className="settings-cli-action-btn flex h-5.5 items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 text-[11px] font-medium text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
                        onClick={() => void handleRunAction(tool.id, "install", tool.displayName)}
                      >
                        {operating === "install" ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <Download className="h-2.5 w-2.5" />
                        )}
                        <span>
                          {operating === "install"
                            ? t("settings.cliInstalling")
                            : t("settings.cliInstall")}
                        </span>
                      </button>
                    ) : null}

                    <LxTooltip content={t("settings.cliCopyInstallCommand")} placement="top">
                      <LxIconButton
                        size="small"
                        aria-label={t("settings.cliCopyInstallCommand")}
                        onClick={() => void handleCopyInstallCommand(tool.id)}
                      >
                        <Copy className="h-3 w-3 text-white/50" />
                      </LxIconButton>
                    </LxTooltip>

                    <LxTooltip content={t("settings.cliCustomPath")} placement="top">
                      <LxIconButton
                        size="small"
                        highlighted={isCustomPathOpen || Boolean(currentCustomPath)}
                        aria-label={t("settings.cliCustomPath")}
                        onClick={() =>
                          setShowCustomPathMap((prev) => ({
                            ...prev,
                            [tool.id]: !prev[tool.id],
                          }))
                        }
                      >
                        <FolderOpen className="h-3 w-3" />
                      </LxIconButton>
                    </LxTooltip>
                  </div>
                </div>

                {/* 展开的自定义路径输入框 */}
                {(isCustomPathOpen || currentCustomPath) && (
                  <div className="settings-cli-custom-path flex items-center gap-2 border-t border-white/5 pt-2">
                    <span className="shrink-0 text-xs text-white/40">
                      {t("settings.cliCustomPath")}:
                    </span>
                    <div className="flex-1">
                      <LxInput
                        size="xs"
                        placeholder={t("settings.cliCustomPathPlaceholder")}
                        value={currentCustomPath}
                        onChange={(e) => handleCustomPathChange(tool.id, e.target.value)}
                        clear
                        onClear={() => handleCustomPathChange(tool.id, "")}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
