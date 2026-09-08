import type { Locale, UiSettings } from "@shared/settings"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { useRegisterSettingsSection } from "@/features/settings/hooks/settingsDraftStore"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"

export const GeneralSettings = (): React.JSX.Element => {
  const { locale, setLocale, t } = useTranslation()
  const [screenshotCleanupEnabled, setScreenshotCleanupEnabled] = useState(true)
  const baselineCleanupRef = useRef<boolean | null>(null)

  useEffect(() => {
    let isCurrent = true
    void settingsApi.getUiSettings().then((ui) => {
      if (isCurrent && ui) {
        const enabled = ui.screenshotCleanupEnabled ?? true
        setScreenshotCleanupEnabled(enabled)
        if (baselineCleanupRef.current === null) {
          baselineCleanupRef.current = enabled
        }
      }
    })
    return () => {
      isCurrent = false
    }
  }, [])

  const isDirty = useMemo(() => {
    if (baselineCleanupRef.current === null) return false
    return screenshotCleanupEnabled !== baselineCleanupRef.current
  }, [screenshotCleanupEnabled])

  const handleSave = useCallback(async (): Promise<void> => {
    const current = await settingsApi.getUiSettings()
    const updated: UiSettings = {
      ...current,
      screenshotCleanupEnabled,
    }
    await settingsApi.saveUiSettings(updated)
    baselineCleanupRef.current = screenshotCleanupEnabled
    notifySettingsChanged("ui")
  }, [screenshotCleanupEnabled])

  const handleReset = useCallback((): void => {
    if (baselineCleanupRef.current !== null) {
      setScreenshotCleanupEnabled(baselineCleanupRef.current)
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
    </div>
  )
}
