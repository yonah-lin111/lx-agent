import type { EnvironmentId, EnvironmentRuntimeInfo } from "@shared/settings"
import {
  CheckCircle2,
  Coffee,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  GitBranch,
  Hexagon,
  RefreshCw,
  Search,
  Terminal,
  XCircle,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxTag } from "@/components/ui/LxTag"
import { useLxToast } from "@/components/ui/LxToast"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { type TranslationKey, useTranslation } from "@/i18n"

const getEnvironmentIcon = (id: EnvironmentId) => {
  switch (id) {
    case "git":
      return GitBranch
    case "node":
      return Hexagon
    case "python":
      return FileCode
    case "java":
      return Coffee
    default:
      return Terminal
  }
}

export const EnvironmentSettings = (): React.JSX.Element => {
  const { t } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [environments, setEnvironments] = useState<EnvironmentRuntimeInfo[]>([])

  useRegisterSettingsSection({
    section: "environment",
    isDirty: false,
    onSave: async () => {},
    onReset: () => {},
  })

  const loadData = useCallback(
    async (force = false) => {
      try {
        if (force) setRefreshing(true)
        else setLoading(true)

        const res = await settingsApi.getEnvironmentVersions({ force })
        setEnvironments(res)
      } catch (err) {
        console.error("[EnvironmentSettings] Failed to load environment runtimes:", err)
        toast.error(t("settings.environmentLoadFailed"))
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

  const handleOpenUrl = (url: string) => {
    if (url) {
      window.open(url, "_blank")
    }
  }

  const handleCopyVersion = async (version: string) => {
    try {
      await navigator.clipboard.writeText(version)
      toast.success(t("settings.environmentCopyVersionSuccess"))
    } catch (err) {
      console.error("[EnvironmentSettings] Failed to copy version:", err)
    }
  }

  const filteredEnvironments = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return environments
    return environments.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.displayName.toLowerCase().includes(q) ||
        item.command.toLowerCase().includes(q),
    )
  }, [environments, searchQuery])

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
      {/* 顶部搜索与刷新工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0 max-w-xs">
          <LxInput
            prefix={<Search className="h-3.5 w-3.5 text-white/40" />}
            placeholder={t("settings.environmentSearchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            clear
            onClear={() => setSearchQuery("")}
          />
        </div>
        <LxIconButton
          preset="default"
          aria-label={t("settings.environmentRefresh")}
          title={{ content: t("settings.environmentRefresh"), placement: "left" }}
          disabled={refreshing || loading}
          onClick={() => void loadData(true)}
        >
          <RefreshCw className={`${refreshing ? "animate-spin text-white" : ""}`} />
        </LxIconButton>
      </div>

      {/* 提示信息说明与文档 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        <div className="flex items-center gap-2">
          <span>{t("settings.environmentDesc")}</span>
          <LxInfoTooltip markdown={t("settings.environmentDoc")} placement="right" />
        </div>
      </div>

      {/* 环境卡片列表 */}
      <div className="grid grid-cols-1 gap-2.5">
        {filteredEnvironments.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-xs text-white/30">
            {t("settings.environmentNoMatches")}
          </div>
        ) : (
          filteredEnvironments.map((env) => {
            const Icon = getEnvironmentIcon(env.id)

            return (
              <div
                key={env.id}
                className="settings-item-card group relative flex flex-col gap-3 rounded-[6px] border border-white/8 bg-white/[0.02] p-3.5 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
              >
                {/* 顶部身份栏：Icon + 名称 + 命令 + 必需Tag + 状态徽标 */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px] bg-white/5 text-white/80">
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="truncate text-sm font-medium text-white">
                      {env.displayName}
                    </span>
                    <code className="shrink-0 rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white/45">
                      {env.command}
                    </code>
                    {env.isRequired ? (
                      <LxTag size="small" color="amber" className="shrink-0 font-medium">
                        {t("settings.environmentRequiredTag")}
                      </LxTag>
                    ) : (
                      <LxTag size="small" color="gray" className="shrink-0 text-white/50">
                        {t("settings.environmentOptionalTag")}
                      </LxTag>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {env.installed ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>{t("settings.environmentInstalled")}</span>
                        {env.version ? (
                          <span className="font-mono text-white/90">v{env.version}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-400">
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>{t("settings.environmentNotInstalled")}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 说明文案 */}
                <p className="text-xs text-white/65 leading-relaxed">
                  {t(env.descriptionKey as TranslationKey)}
                </p>

                {/* 底部操作与检测路径 */}
                <div className="flex items-center justify-between gap-2 border-t border-white/6 pt-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    {env.path ? (
                      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/40 font-mono">
                        <Terminal className="h-3 w-3 shrink-0 text-white/30" />
                        <span className="truncate" title={env.path}>
                          {env.path}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-white/30 italic">
                        {env.installed ? "" : t("settings.environmentNotInstalled")}
                      </span>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {env.installed && env.version ? (
                      <button
                        type="button"
                        onClick={() => void handleCopyVersion(env.version || "")}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
                        title={t("settings.environmentCopyVersionSuccess")}
                      >
                        <Copy className="h-3 w-3" />
                        <span>{t("settings.environmentVersion")}</span>
                      </button>
                    ) : null}

                    {env.installed ? (
                      <button
                        type="button"
                        onClick={() => handleOpenUrl(env.downloadUrl)}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-white/50 transition-colors hover:bg-white/5 hover:text-white cursor-pointer"
                      >
                        <span>{t("settings.cliHomepage")}</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleOpenUrl(env.downloadUrl)}
                        className="inline-flex items-center gap-1.5 rounded-[5px] border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/30 cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>{t("settings.environmentGet", { name: env.displayName })}</span>
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
