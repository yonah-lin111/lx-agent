import {
  CAVEMAN_LEVELS,
  CAVEMAN_WENYAN_LEVELS,
  type CavemanLevel,
  DEFAULT_TOKEN_SAVER_SETTINGS,
  PONYTAIL_LEVELS,
  type PonytailLevel,
  type TokenSaverSettings as TokenSaverSettingsConfig,
} from "@shared/settings"
import { Github, Loader2, Scissors, TrendingDown, Wrench } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxSelect } from "@/components/ui/LxSelect"
import { useLxToast } from "@/components/ui/LxToast"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { type TranslationKey, useTranslation } from "@/i18n"

// 工具官网地址。
const RTK_HOMEPAGE = "https://github.com/rtk-ai/rtk"
const CAVEMAN_HOMEPAGE = "https://github.com/JuliusBrussee/caveman"
const PONYTAIL_HOMEPAGE = "https://github.com/DietrichGebert/ponytail"

// Caveman 档位文案。
const CAVEMAN_LEVEL_LABEL_KEYS: Record<CavemanLevel, TranslationKey> = {
  lite: "settings.tokenSaverCavemanLevelLite",
  full: "settings.tokenSaverCavemanLevelFull",
  ultra: "settings.tokenSaverCavemanLevelUltra",
  "wenyan-lite": "settings.tokenSaverCavemanLevelWenyanLite",
  wenyan: "settings.tokenSaverCavemanLevelWenyan",
  "wenyan-ultra": "settings.tokenSaverCavemanLevelWenyanUltra",
}

const CAVEMAN_LEVEL_DESC_KEYS: Record<CavemanLevel, TranslationKey> = {
  lite: "settings.tokenSaverCavemanLevelLiteDesc",
  full: "settings.tokenSaverCavemanLevelFullDesc",
  ultra: "settings.tokenSaverCavemanLevelUltraDesc",
  "wenyan-lite": "settings.tokenSaverCavemanLevelWenyanLiteDesc",
  wenyan: "settings.tokenSaverCavemanLevelWenyanDesc",
  "wenyan-ultra": "settings.tokenSaverCavemanLevelWenyanUltraDesc",
}

// Ponytail 档位文案。
const PONYTAIL_LEVEL_LABEL_KEYS: Record<PonytailLevel, TranslationKey> = {
  lite: "settings.tokenSaverPonytailLevelLite",
  full: "settings.tokenSaverPonytailLevelFull",
  ultra: "settings.tokenSaverPonytailLevelUltra",
}

const PONYTAIL_LEVEL_DESC_KEYS: Record<PonytailLevel, TranslationKey> = {
  lite: "settings.tokenSaverPonytailLevelLiteDesc",
  full: "settings.tokenSaverPonytailLevelFullDesc",
  ultra: "settings.tokenSaverPonytailLevelUltraDesc",
}

// 卡片文案配置。
interface TokenSaverCardMeta {
  key: "rtk" | "caveman" | "ponytail"
  titleKey: TranslationKey
  descKey: TranslationKey
  homepage: string
  icon: typeof Scissors
}

const CARD_META: TokenSaverCardMeta[] = [
  {
    key: "rtk",
    titleKey: "settings.tokenSaverRtkTitle",
    descKey: "settings.tokenSaverRtkDesc",
    homepage: RTK_HOMEPAGE,
    icon: Wrench,
  },
  {
    key: "caveman",
    titleKey: "settings.tokenSaverCavemanTitle",
    descKey: "settings.tokenSaverCavemanDesc",
    homepage: CAVEMAN_HOMEPAGE,
    icon: Scissors,
  },
  {
    key: "ponytail",
    titleKey: "settings.tokenSaverPonytailTitle",
    descKey: "settings.tokenSaverPonytailDesc",
    homepage: PONYTAIL_HOMEPAGE,
    icon: TrendingDown,
  },
]

/**
 * 渲染 Token Saver 分区：RTK 工具输出压缩、Caveman 与 Ponytail 风格提示词。
 */
export const TokenSaverSettings = (): React.JSX.Element => {
  const { t, locale } = useTranslation()
  const toast = useLxToast()

  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<TokenSaverSettingsConfig>(DEFAULT_TOKEN_SAVER_SETTINGS)
  const baselineRef = useRef<string | null>(null)

  const isDirty = useMemo(() => {
    if (baselineRef.current === null) return false
    return JSON.stringify(settings) !== baselineRef.current
  }, [settings])

  // 非中文界面不提供文言文档位。
  const visibleCavemanLevels = useMemo(
    () =>
      locale === "zh"
        ? CAVEMAN_LEVELS
        : CAVEMAN_LEVELS.filter((level) => !CAVEMAN_WENYAN_LEVELS.includes(level)),
    [locale],
  )

  // 已存文言文档位但界面语言非中文时，展示与保存均回退 ultra。
  const effectiveCavemanLevel: CavemanLevel = visibleCavemanLevels.includes(settings.cavemanLevel)
    ? settings.cavemanLevel
    : "ultra"

  const handleSave = useCallback(async (): Promise<void> => {
    const normalized: TokenSaverSettingsConfig = {
      ...settings,
      cavemanLevel: effectiveCavemanLevel,
    }
    try {
      const saved = await settingsApi.saveTokenSaverSettings(normalized)
      setSettings(saved)
      baselineRef.current = JSON.stringify(saved)
      notifySettingsChanged("tokenSaver")
    } catch (error) {
      console.error("[TokenSaverSettings] Failed to save settings:", error)
      toast.error(t("settings.saveFailed"))
      throw error
    }
  }, [settings, effectiveCavemanLevel, t, toast])

  const handleReset = useCallback((): void => {
    if (baselineRef.current !== null) {
      setSettings(JSON.parse(baselineRef.current))
    }
  }, [])

  useRegisterSettingsSection({
    section: "token-saver",
    isDirty,
    onSave: handleSave,
    onReset: handleReset,
  })

  const loadData = useCallback(async (): Promise<void> => {
    try {
      setLoading(true)
      const loaded = await settingsApi.getTokenSaverSettings()
      setSettings(loaded)
      baselineRef.current = JSON.stringify(loaded)
    } catch (error) {
      console.error("[TokenSaverSettings] Failed to load settings:", error)
      toast.error(t("settings.loadSettingsFailed"))
    } finally {
      setLoading(false)
    }
  }, [t, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // 开关某张工具的启用状态。
  const handleToggle = (key: TokenSaverCardMeta["key"], checked: boolean): void => {
    if (key === "rtk") setSettings((prev) => ({ ...prev, rtkEnabled: checked }))
    if (key === "caveman") setSettings((prev) => ({ ...prev, cavemanEnabled: checked }))
    if (key === "ponytail") setSettings((prev) => ({ ...prev, ponytailEnabled: checked }))
  }

  // 工具启用状态。
  const isCardEnabled = (key: TokenSaverCardMeta["key"]): boolean => {
    if (key === "rtk") return settings.rtkEnabled
    if (key === "caveman") return settings.cavemanEnabled
    return settings.ponytailEnabled
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
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3.5">
      {/* 分区说明与文档 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs leading-relaxed text-white/60">
        <div className="flex items-center gap-2">
          <span>{t("settings.tokenSaverDesc")}</span>
          <LxInfoTooltip markdown={t("settings.tokenSaverDoc")} placement="right" />
        </div>
      </div>

      {/* 工具卡片列表 */}
      <div className="grid grid-cols-1 gap-2.5">
        {CARD_META.map((meta) => {
          const Icon = meta.icon
          const enabled = isCardEnabled(meta.key)
          return (
            <div
              key={meta.key}
              className="settings-item-card group relative flex flex-col gap-2.5 rounded-[6px] border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-white/15 hover:bg-white/[0.03]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] bg-white/[0.05] text-white/80">
                    <Icon className={`h-4 w-4 ${enabled ? "text-emerald-400" : "text-white/40"}`} />
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-semibold text-white/90">
                      {t(meta.titleKey)}
                    </span>
                    <span className="truncate text-xs text-white/45">{t(meta.descKey)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <LxIconButton
                    preset="default"
                    onClick={() => window.open(meta.homepage, "_blank")}
                    title={{ content: t("settings.tokenSaverHomepage"), placement: "top" }}
                    aria-label={`${t("settings.tokenSaverHomepage")} ${t(meta.titleKey)}`}
                  >
                    <Github className="text-white/70" />
                  </LxIconButton>

                  <div className="h-3.5 w-px bg-white/10" />

                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70">
                    <LxCheckbox
                      checked={enabled}
                      onChange={(checked) => handleToggle(meta.key, checked)}
                    />
                    <span>{t("settings.enable")}</span>
                  </label>
                </div>
              </div>

              {meta.key === "caveman" && settings.cavemanEnabled && (
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0 text-xs text-white/40">
                      {t("settings.tokenSaverCavemanLevel")}
                    </span>
                    <LxSelect
                      value={effectiveCavemanLevel}
                      onChange={(level) =>
                        setSettings((prev) => ({ ...prev, cavemanLevel: level }))
                      }
                      options={visibleCavemanLevels.map((level) => ({
                        value: level,
                        label: t(CAVEMAN_LEVEL_LABEL_KEYS[level]),
                      }))}
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-white/40">
                    {t(CAVEMAN_LEVEL_DESC_KEYS[effectiveCavemanLevel])}
                  </p>
                </div>
              )}

              {meta.key === "ponytail" && settings.ponytailEnabled && (
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-2">
                  <div className="flex items-center gap-2.5">
                    <span className="shrink-0 text-xs text-white/40">
                      {t("settings.tokenSaverPonytailLevel")}
                    </span>
                    <LxSelect
                      value={settings.ponytailLevel}
                      onChange={(level) =>
                        setSettings((prev) => ({ ...prev, ponytailLevel: level }))
                      }
                      options={PONYTAIL_LEVELS.map((level) => ({
                        value: level,
                        label: t(PONYTAIL_LEVEL_LABEL_KEYS[level]),
                      }))}
                    />
                  </div>
                  <p className="text-xs leading-relaxed text-white/40">
                    {t(PONYTAIL_LEVEL_DESC_KEYS[settings.ponytailLevel])}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
