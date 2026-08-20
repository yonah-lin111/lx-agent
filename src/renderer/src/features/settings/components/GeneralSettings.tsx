import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { useTranslation } from "@/i18n"
import type { Locale } from "@shared/settings"

export const GeneralSettings = (): React.JSX.Element => {
  const { locale, setLocale, t } = useTranslation()

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
    </div>
  )
}
