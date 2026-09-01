import type {
  LspLanguageId,
  LspServerDetailInfo,
  LspSettings as LspSettingsType,
} from "@shared/settings"
import {
  CheckCircle2,
  Code2,
  Copy,
  Download,
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

export const LspSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [lspSettings, setLspSettings] = useState<LspSettingsType>({ languages: {} })
  const [initialSettings, setInitialSettings] = useState<LspSettingsType | null>(null)
  const [statuses, setStatuses] = useState<LspServerDetailInfo[]>([])
  const [installingMap, setInstallingMap] = useState<Record<string, boolean>>({})
  const [showCustomConfigMap, setShowCustomConfigMap] = useState<Record<string, boolean>>({})

  // 加载 LSP 配置与检测状态
  const loadData = useCallback(
    async (isManualRefresh = false) => {
      try {
        if (isManualRefresh) setRefreshing(true)
        else setLoading(true)

        const [settingsRes, statusRes] = await Promise.all([
          settingsApi.getLspSettings(),
          settingsApi.getLspStatus(),
        ])

        setLspSettings(settingsRes)
        setInitialSettings(JSON.parse(JSON.stringify(settingsRes)))
        setStatuses(statusRes)
      } catch (err) {
        console.error("[LspSettings] Failed to load LSP data:", err)
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
    return JSON.stringify(lspSettings) !== JSON.stringify(initialSettings)
  }, [lspSettings, initialSettings])

  useEffect(() => {
    settingsDirtyStore.setSectionDirty("lsp", isDirty)
  }, [isDirty])

  useEffect(() => {
    const unregisterSave = settingsDirtyStore.registerSaveHandler("lsp", async () => {
      const saved = await settingsApi.saveLspSettings(lspSettings)
      setLspSettings(saved)
      setInitialSettings(JSON.parse(JSON.stringify(saved)))
      settingsDirtyStore.setSectionDirty("lsp", false)
      notifySettingsChanged("lsp")
      // 重新拉取检测状态
      const statusRes = await settingsApi.getLspStatus()
      setStatuses(statusRes)
    })

    const unregisterReset = settingsDirtyStore.registerResetHandler("lsp", () => {
      if (initialSettings) {
        setLspSettings(JSON.parse(JSON.stringify(initialSettings)))
      }
      settingsDirtyStore.setSectionDirty("lsp", false)
    })

    return () => {
      unregisterSave()
      unregisterReset()
    }
  }, [lspSettings, initialSettings])

  // 切换语言 LSP 启用状态
  const handleToggleEnabled = (langId: LspLanguageId, checked: boolean) => {
    setLspSettings((prev) => ({
      ...prev,
      languages: {
        ...prev.languages,
        [langId]: {
          ...prev.languages[langId],
          enabled: checked,
        },
      },
    }))
  }

  // 修改自定义路径
  const handleCustomPathChange = (langId: LspLanguageId, customPath: string) => {
    setLspSettings((prev) => ({
      ...prev,
      languages: {
        ...prev.languages,
        [langId]: {
          ...prev.languages[langId],
          enabled: prev.languages[langId]?.enabled ?? true,
          customPath: customPath.trim(),
        },
      },
    }))
  }

  // 修改自定义参数
  const handleArgsChange = (langId: LspLanguageId, argsStr: string) => {
    const args = argsStr
      .split(" ")
      .map((s) => s.trim())
      .filter(Boolean)
    setLspSettings((prev) => ({
      ...prev,
      languages: {
        ...prev.languages,
        [langId]: {
          ...prev.languages[langId],
          enabled: prev.languages[langId]?.enabled ?? true,
          args,
        },
      },
    }))
  }

  // 手动执行安装
  const handleInstall = async (item: LspServerDetailInfo) => {
    setInstallingMap((prev) => ({ ...prev, [item.packageName]: true }))
    try {
      const success = await settingsApi.installLspServer(item.packageName)
      if (success) {
        toast.success(t("settings.lspInstallSuccess", { name: item.name }))
        const updatedStatus = await settingsApi.getLspStatus()
        setStatuses(updatedStatus)
      } else {
        toast.error(t("settings.lspInstallFailed", { name: item.name }))
      }
    } catch (err) {
      console.error("[LspSettings] Install failed:", err)
      toast.error(t("settings.lspInstallFailed", { name: item.name }))
    } finally {
      setInstallingMap((prev) => ({ ...prev, [item.packageName]: false }))
    }
  }

  // 复制安装命令
  const handleCopyInstallCommand = async (packageName: string) => {
    const cmd = `npm install -g ${packageName}`
    try {
      await navigator.clipboard.writeText(cmd)
      toast.success(t("settings.lspCopyInstallSuccess"))
    } catch {
      toast.error(t("agent.copyFailed"))
    }
  }

  const filteredStatuses = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return statuses
    return statuses.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.packageName.toLowerCase().includes(q),
    )
  }, [statuses, searchQuery])

  if (loading && statuses.length === 0) {
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
            placeholder={t("settings.lspSearchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clear
            onClear={() => setSearchQuery("")}
          />
        </div>
        <LxIconButton
          preset="default"
          aria-label={t("settings.lspRefresh")}
          title={{ content: t("settings.lspRefresh"), placement: "left" }}
          disabled={refreshing}
          onClick={() => void loadData(true)}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-white" : ""}`} />
        </LxIconButton>
      </div>

      {/* 提示信息说明 */}
      <div className="rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        {t("settings.lspExplanation")}
      </div>

      {/* LSP 列表卡片 */}
      <div className="grid grid-cols-1 gap-2.5">
        {filteredStatuses.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-white/30">
            {t("settings.lspNoMatches")}
          </div>
        ) : (
          filteredStatuses.map((item) => {
            const langConfig = lspSettings.languages?.[item.id]
            const isEnabled = langConfig?.enabled !== false
            const isInstalling = installingMap[item.packageName] || false
            const isCustomOpen = showCustomConfigMap[item.id] || Boolean(langConfig?.customPath)
            const currentCustomPath = langConfig?.customPath || ""
            const currentArgs = langConfig?.args ? langConfig.args.join(" ") : ""

            return (
              <div
                key={item.id}
                className="settings-item-card group relative flex flex-col gap-2.5 rounded-[6px] border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
              >
                {/* 第 1 行：身份信息、检测状态与启用开关 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05] text-white/80">
                      <Code2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-white/90">
                          {item.name}
                        </span>
                        <LxTag size="small" color="gray">
                          {item.packageName}
                        </LxTag>
                      </div>
                    </div>
                  </div>

                  {/* 状态徽标与右侧操作 */}
                  <div className="flex shrink-0 items-center gap-2">
                    {item.installed ? (
                      <LxTooltip
                        content={item.detectedPath || t("settings.lspDetected")}
                        placement="top"
                      >
                        <span className="flex items-center gap-1 rounded-[4px] bg-emerald-500/10 px-1.5 py-0.5 text-[11px] text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>{t("settings.lspDetected")}</span>
                        </span>
                      </LxTooltip>
                    ) : (
                      <span className="flex items-center gap-1 rounded-[4px] bg-red-500/10 px-1.5 py-0.5 text-[11px] text-red-400">
                        <XCircle className="h-3 w-3" />
                        <span>{t("settings.lspNotDetected")}</span>
                      </span>
                    )}

                    <div className="h-3.5 w-px bg-white/10" />

                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-white/70">
                      <LxCheckbox
                        checked={isEnabled}
                        onChange={(checked) => handleToggleEnabled(item.id, checked)}
                      />
                      <span>{t("settings.enable")}</span>
                    </label>
                  </div>
                </div>

                {/* 第 2 行：快捷安装与自定义配置入口 */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5 text-xs text-white/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-white/40">
                      {t("settings.lspDefaultBin")}:{" "}
                      <code className="font-mono text-white/70">{item.defaultBin}</code>
                    </span>
                    {item.detectedPath && (
                      <span className="text-[11px] text-white/30 truncate max-w-[280px]">
                        ({item.detectedPath})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {!item.installed && (
                      <>
                        <LxIconButton
                          preset="default"
                          size="small"
                          disabled={isInstalling}
                          onClick={() => void handleInstall(item)}
                          title={{ content: t("settings.lspManualInstall"), placement: "top" }}
                          aria-label={t("settings.lspManualInstall")}
                        >
                          {isInstalling ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                          ) : (
                            <Download className="h-3.5 w-3.5 text-white/80" />
                          )}
                        </LxIconButton>
                        <LxIconButton
                          preset="default"
                          size="small"
                          onClick={() => void handleCopyInstallCommand(item.packageName)}
                          title={{ content: t("settings.lspCopyInstallCommand"), placement: "top" }}
                          aria-label={t("settings.lspCopyInstallCommand")}
                        >
                          <Copy className="h-3.5 w-3.5 text-white/80" />
                        </LxIconButton>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        setShowCustomConfigMap((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                      }
                      className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors cursor-pointer"
                    >
                      <FolderOpen className="h-3 w-3" />
                      <span>
                        {isCustomOpen ? t("settings.lspHideCustom") : t("settings.lspShowCustom")}
                      </span>
                    </button>
                  </div>
                </div>

                {/* 展开的自定义配置输入框 */}
                {isCustomOpen && (
                  <div className="mt-1 flex flex-col gap-2 rounded-[6px] bg-white/[0.02] p-2.5 border border-white/5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-white/50 font-medium">
                        {t("settings.lspCustomPath")}
                      </span>
                      <LxInput
                        size="sm"
                        placeholder={t("settings.lspCustomPathPlaceholder", {
                          defaultBin: item.defaultBin,
                        })}
                        value={currentCustomPath}
                        onChange={(e) => handleCustomPathChange(item.id, e.target.value)}
                        clear
                        onClear={() => handleCustomPathChange(item.id, "")}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[11px] text-white/50 font-medium">
                        {t("settings.lspCustomArgs")}
                      </span>
                      <LxInput
                        size="sm"
                        placeholder="--stdio"
                        value={currentArgs}
                        onChange={(e) => handleArgsChange(item.id, e.target.value)}
                        clear
                        onClear={() => handleArgsChange(item.id, "")}
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
