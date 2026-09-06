import type { VoiceSettings } from "@shared/settings"
import { DEFAULT_VOICE_SETTINGS } from "@shared/settings"
import { useEffect, useState } from "react"
import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect, type LxSelectOption } from "@/components/ui/LxSelect"
import { settingsApi } from "@/features/settings/api/settingsApi"
import { notifySettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { useTranslation } from "@/i18n"

const VOICE_MODEL_OPTIONS: LxSelectOption<string>[] = [
  {
    value: "whisper-large-v3-turbo",
    label: "whisper-large-v3-turbo (Recommended - Fast & Accurate)",
  },
  { value: "whisper-large-v3", label: "whisper-large-v3 (High Accuracy)" },
  {
    value: "distil-whisper-large-v3-en",
    label: "distil-whisper-large-v3-en (English Only - Ultra Fast)",
  },
]

const VOICE_LANGUAGE_OPTIONS: LxSelectOption<string>[] = [
  { value: "auto", label: "Auto Detect (自动识别)" },
  { value: "zh", label: "Simplified Chinese (简体中文)" },
  { value: "zh-TW", label: "Traditional Chinese (繁體中文)" },
  { value: "en", label: "English (英语)" },
  { value: "ja", label: "Japanese (日语)" },
  { value: "ko", label: "Korean (韩语)" },
  { value: "fr", label: "French (法语)" },
  { value: "de", label: "German (德语)" },
  { value: "es", label: "Spanish (西班牙语)" },
]

export const VoiceSettingsComponent = (): React.JSX.Element => {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isCurrent = true
    void settingsApi.getVoiceSettings().then((loaded) => {
      if (isCurrent && loaded) {
        setSettings(loaded)
        setIsLoading(false)
      }
    })
    return () => {
      isCurrent = false
    }
  }, [])

  const handleUpdate = async (nextSettings: VoiceSettings): Promise<void> => {
    setSettings(nextSettings)
    try {
      await settingsApi.saveVoiceSettings(nextSettings)
      notifySettingsChanged("voice")
    } catch (err) {
      console.error("Failed to save voice settings", err)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        {t("common.loading")}
      </div>
    )
  }

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* 说明栏 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        <div className="flex items-center gap-2">
          <span>{t("settings.voiceDesc")}</span>
          <LxInfoTooltip markdown={t("settings.voiceDoc")} placement="right" />
        </div>
      </div>

      {/* Groq API Key 配置 */}
      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.voiceApiKey")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.voiceApiKeyDesc")}</p>
          <div className="pt-1">
            <LxInput
              type="password"
              value={settings.apiKey ?? ""}
              placeholder="gsk_..."
              onChange={(e) => void handleUpdate({ ...settings, apiKey: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Whisper 语音模型 */}
      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.voiceModel")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.voiceModelDesc")}</p>
          <div className="pt-1">
            <LxSelect
              value={settings.model}
              options={VOICE_MODEL_OPTIONS}
              onChange={(value) => void handleUpdate({ ...settings, model: value })}
            />
          </div>
        </div>
      </div>

      {/* 识别语言 */}
      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.voiceLanguage")}</h3>
        <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
          <p className="text-xs text-white/45">{t("settings.voiceLanguageDesc")}</p>
          <div className="pt-1">
            <LxSelect
              value={settings.language ?? "auto"}
              options={VOICE_LANGUAGE_OPTIONS}
              onChange={(value) => void handleUpdate({ ...settings, language: value })}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
