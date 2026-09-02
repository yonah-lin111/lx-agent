import type { Locale, UiSettings } from "@shared/settings"
import { useEffect, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"

export const GeneralSettings = (): React.JSX.Element => {
  const { locale, setLocale, t } = useTranslation()
  const [screenshotCleanupEnabled, setScreenshotCleanupEnabled] = useState(true)

  useEffect(() => {
    let isCurrent = true
    void settingsApi.getUiSettings().then((ui) => {
      if (isCurrent && ui) {
        setScreenshotCleanupEnabled(ui.screenshotCleanupEnabled ?? true)
      }
    })
    return () => {
      isCurrent = false
    }
  }, [])

  const handleToggleCleanup = async (checked: boolean): Promise<void> => {
    setScreenshotCleanupEnabled(checked)
    try {
      const current = await settingsApi.getUiSettings()
      const updated: UiSettings = {
        ...current,
        screenshotCleanupEnabled: checked,
      }
      await settingsApi.saveUiSettings(updated)
      notifySettingsChanged("ui")
    } catch (err) {
      console.error("Failed to save screenshot cleanup setting", err)
    }
  }

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
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
