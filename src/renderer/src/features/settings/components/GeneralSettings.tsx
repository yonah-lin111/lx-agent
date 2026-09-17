import type { Locale, UiSettings } from "@shared/settings"
import { Download, Loader2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { type UpdateNotice, useUpdateNotice } from "@/features/update"
import { type TranslationKey, useTranslation } from "@/i18n"

// 检查结果文案：失败 / 发现新版本 / 已是最新。
const resolveUpdateStatusText = (
  notice: UpdateNotice,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string => {
  if (notice.failed) return t("settings.updateFailed")
  if (notice.hasUpdate && notice.latestVersion) {
    return t("settings.updateAvailable", { version: notice.latestVersion })
  }
  return t("settings.updateLatest")
}

export const GeneralSettings = (): React.JSX.Element => {
  const { locale, setLocale, t } = useTranslation()
  const updateNotice = useUpdateNotice()
  const [screenshotCleanupEnabled, setScreenshotCleanupEnabled] = useState(true)
  const [agentCompletionNotifyEnabled, setAgentCompletionNotifyEnabled] = useState(true)
  const [openclawCompletionNotifyEnabled, setOpenclawCompletionNotifyEnabled] = useState(true)
  const baselineCleanupRef = useRef<boolean | null>(null)
  const baselineAgentNotifyRef = useRef<boolean | null>(null)
  const baselineOpenclawNotifyRef = useRef<boolean | null>(null)

  useEffect(() => {
    let isCurrent = true
    void settingsApi.getUiSettings().then((ui) => {
      if (isCurrent && ui) {
        const enabled = ui.screenshotCleanupEnabled ?? true
        setScreenshotCleanupEnabled(enabled)
        if (baselineCleanupRef.current === null) {
          baselineCleanupRef.current = enabled
        }
        const agentNotify = ui.agentCompletionNotifyEnabled ?? true
        setAgentCompletionNotifyEnabled(agentNotify)
        if (baselineAgentNotifyRef.current === null) {
          baselineAgentNotifyRef.current = agentNotify
        }
        const openclawNotify = ui.openclawCompletionNotifyEnabled ?? true
        setOpenclawCompletionNotifyEnabled(openclawNotify)
        if (baselineOpenclawNotifyRef.current === null) {
          baselineOpenclawNotifyRef.current = openclawNotify
        }
      }
    })
    return () => {
      isCurrent = false
    }
  }, [])

  const isDirty = useMemo(() => {
    if (baselineCleanupRef.current === null) return false
    return (
      screenshotCleanupEnabled !== baselineCleanupRef.current ||
      agentCompletionNotifyEnabled !== baselineAgentNotifyRef.current ||
      openclawCompletionNotifyEnabled !== baselineOpenclawNotifyRef.current
    )
  }, [screenshotCleanupEnabled, agentCompletionNotifyEnabled, openclawCompletionNotifyEnabled])

  const handleSave = useCallback(async (): Promise<void> => {
    const current = await settingsApi.getUiSettings()
    const updated: UiSettings = {
      ...current,
      screenshotCleanupEnabled,
      agentCompletionNotifyEnabled,
      openclawCompletionNotifyEnabled,
    }
    await settingsApi.saveUiSettings(updated)
    baselineCleanupRef.current = screenshotCleanupEnabled
    baselineAgentNotifyRef.current = agentCompletionNotifyEnabled
    baselineOpenclawNotifyRef.current = openclawCompletionNotifyEnabled
    notifySettingsChanged("ui")
  }, [screenshotCleanupEnabled, agentCompletionNotifyEnabled, openclawCompletionNotifyEnabled])

  const handleReset = useCallback((): void => {
    if (baselineCleanupRef.current !== null) {
      setScreenshotCleanupEnabled(baselineCleanupRef.current)
    }
    if (baselineAgentNotifyRef.current !== null) {
      setAgentCompletionNotifyEnabled(baselineAgentNotifyRef.current)
    }
    if (baselineOpenclawNotifyRef.current !== null) {
      setOpenclawCompletionNotifyEnabled(baselineOpenclawNotifyRef.current)
    }
  }, [])

  useRegisterSettingsSection({
    section: "general",
    isDirty,
    onSave: handleSave,
    onReset: handleReset,
  })

  const handleToggleCleanup = (checked: boolean): void => {
    setScreenshotCleanupEnabled(checked)
  }

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* 提示信息说明与文档 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        <div className="flex items-center gap-2">
          <span>{t("settings.generalDesc")}</span>
          <LxInfoTooltip markdown={t("settings.generalDoc")} placement="right" />
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.language")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.languageDesc")}</p>
          <div className="flex items-center pt-1">
            <LxRadioGroup
              className="flex gap-4"
              name="ui-language"
              value={locale}
              onChange={(val) => void setLocale(val as Locale)}
            >
              <LxRadio value="en" label={t("settings.languageEn")} />
              <LxRadio value="zh" label={t("settings.languageZh")} />
            </LxRadioGroup>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.screenshotCleanup")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.screenshotCleanupDesc")}</p>
          <div className="flex items-center gap-2 pt-1">
            <LxCheckbox
              id="screenshot-cleanup"
              checked={screenshotCleanupEnabled}
              onChange={(checked) => void handleToggleCleanup(checked)}
            />
            <label
              htmlFor="screenshot-cleanup"
              className="cursor-pointer text-xs text-white/80 select-none"
            >
              {t("settings.screenshotCleanupLabel")}
            </label>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.completionNotify")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.completionNotifyDesc")}</p>
          <div className="flex items-center gap-2 pt-1">
            <LxCheckbox
              id="agent-completion-notify"
              checked={agentCompletionNotifyEnabled}
              onChange={(checked) => setAgentCompletionNotifyEnabled(checked)}
            />
            <label
              htmlFor="agent-completion-notify"
              className="cursor-pointer text-xs text-white/80 select-none"
            >
              {t("settings.agentNotifyLabel")}
            </label>
          </div>
          <div className="flex items-center gap-2">
            <LxCheckbox
              id="openclaw-completion-notify"
              checked={openclawCompletionNotifyEnabled}
              onChange={(checked) => setOpenclawCompletionNotifyEnabled(checked)}
            />
            <label
              htmlFor="openclaw-completion-notify"
              className="cursor-pointer text-xs text-white/80 select-none"
            >
              {t("settings.openclawNotifyLabel")}
            </label>
          </div>
        </div>
      </div>

      {/* 版本与更新：非设置项，直连主进程更新服务，不参与草稿保存 */}
      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.updateTitle")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.updateDesc")}</p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="font-mono text-xs text-white/70">
              {t("settings.updateCurrentVersion", { version: updateNotice.currentVersion })}
            </span>
            <LxIconButton
              iconOnly={false}
              disabled={updateNotice.isChecking}
              onClick={() => void updateNotice.check()}
              textClass="text-white/70"
              hoverBgClass="hover:bg-white/[0.08]"
              className="settings-update-action-btn border border-white/10 bg-white/[0.03] font-medium cursor-pointer hover:border-white/20"
              icon={updateNotice.isChecking ? <Loader2 className="animate-spin" /> : <Download />}
            >
              <span>
                {updateNotice.isChecking ? t("settings.updateChecking") : t("settings.updateCheck")}
              </span>
            </LxIconButton>
            {!updateNotice.isChecking && updateNotice.hasChecked ? (
              <span
                className={`text-xs ${updateNotice.failed ? "text-rose-300" : "text-white/60"}`}
              >
                {resolveUpdateStatusText(updateNotice, t)}
              </span>
            ) : null}
            {updateNotice.hasUpdate && updateNotice.releaseUrl ? (
              <a
                href={updateNotice.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[var(--color-theme-accent)] underline-offset-2 hover:underline"
              >
                {t("settings.updateDownload")}
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
