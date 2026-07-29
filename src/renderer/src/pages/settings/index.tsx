import { Save } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { LxSelect } from "@/components/ui/LxSelect"
import { LxTooltip } from "@/components/ui/LxTooltip"
import {
  ModelProviderSettings,
  SETTINGS_SECTIONS,
  useSettingsData,
  useSettingsMutations,
  type ModelSelection,
} from "@/features/settings"

const MODEL_SELECTIONS = [
  { key: "defaultModel", label: "默认对话模型" },
  { key: "titleSummary", label: "标题总结模型" },
  { key: "suggestedQuestions", label: "推荐问题模型" },
] as const

/**
 * 渲染模型选择和推荐问题配置。
 */
const ModelSettingsContent = (): React.JSX.Element => {
  const { settings, setSettings, error, setError } = useSettingsData()
  const { isSaving, saveSettings } = useSettingsMutations()
  const [lastSavedSettings, setLastSavedSettings] = useState<string | null>(null)

  useEffect(() => {
    if (settings && lastSavedSettings === null) {
      setLastSavedSettings(JSON.stringify(settings))
    }
  }, [settings, lastSavedSettings])

  const isSaved = useMemo(() => {
    if (!settings || lastSavedSettings === null) return true
    return JSON.stringify(settings) === lastSavedSettings
  }, [settings, lastSavedSettings])

  const updateSelection = (
    key: (typeof MODEL_SELECTIONS)[number]["key"],
    selection: ModelSelection,
  ): void => {
    setSettings((current) => (current ? { ...current, [key]: selection } : current))
  }

  const save = async (): Promise<void> => {
    if (!settings) return
    setError("")
    try {
      const saved = await saveSettings(settings)
      setSettings(saved)
      setLastSavedSettings(JSON.stringify(saved))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存配置失败")
    }
  }

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        {error || "正在读取配置..."}
      </div>
    )
  }

  const providerOptions = Object.values(settings.providers).map((provider) => ({
    value: provider.id,
    label: provider.name || provider.id,
  }))

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-white/45">选择各类任务默认使用的模型</p>
        <div className="flex items-center gap-1.5">
          <LxIconButton
            preset="save"
            aria-label="保存模型配置"
            title={{ content: "保存配置", placement: "bottom" }}
            disabled={isSaving}
            onClick={() => void save()}
          >
            <Save className="h-4 w-4" />
          </LxIconButton>
          <LxTooltip content={isSaved ? "已保存" : "未保存"} placement="bottom">
            <span
              aria-label={isSaved ? "已保存" : "未保存"}
              className={`h-2 w-2 shrink-0 rounded-full ${
                isSaved ? "bg-emerald-400" : "bg-amber-400"
              }`}
              role="status"
            />
          </LxTooltip>
        </div>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      <div>
        <h3 className="mb-2 text-sm font-medium text-white">默认模型</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {MODEL_SELECTIONS.map(({ key, label }) => {
            const selection = settings[key]
            const models = settings.providers[selection.provider]?.models ?? {}
            return (
              <section key={key}>
                <h4 className="text-xs text-white/60">{label}</h4>
                <div className="mt-2 grid gap-2">
                  <LxSelect
                    value={selection.provider}
                    options={providerOptions}
                    disabled={providerOptions.length === 0}
                    onChange={(provider) =>
                      updateSelection(key, {
                        provider,
                        model: Object.keys(settings.providers[provider]?.models ?? {})[0] ?? "",
                      })
                    }
                  />
                  <LxSelect
                    value={selection.model}
                    options={Object.values(models).map((model) => ({
                      value: model.id,
                      label: model.name,
                    }))}
                    disabled={Object.keys(models).length === 0}
                    onChange={(model) => updateSelection(key, { ...selection, model })}
                  />
                </div>
              </section>
            )
          })}
        </div>
      </div>

      <div className="border-t border-white/8 pt-3">
        <h3 className="mb-2 text-sm font-medium text-white">功能配置</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <section>
            <h4 className="text-xs text-white/60">推荐问题</h4>
            <div className="mt-2 flex items-center">
              <LxRadioGroup
                className="flex gap-2"
                name="suggested-questions"
                value={settings.suggestedQuestionsEnabled ? "enabled" : "disabled"}
                onChange={(value) =>
                  setSettings((current) =>
                    current ? { ...current, suggestedQuestionsEnabled: value === "enabled" } : current,
                  )
                }
              >
                <LxRadio value="enabled" label="启用" />
                <LxRadio value="disabled" label="停用" />
              </LxRadioGroup>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

/**
 * 渲染设置页面。
 */
export const SettingsPage = (): React.JSX.Element => {
  const [searchParams] = useSearchParams()
  const activeSection = searchParams.get("section") ?? SETTINGS_SECTIONS[0].id

  return (
    <section className="min-w-0 flex-1 overflow-hidden rounded-[6px] border border-white/5 bg-[#212121]">
      {activeSection === "models" ? <ModelSettingsContent /> : null}
      {activeSection === "providers" ? <ModelProviderSettings /> : null}
    </section>
  )
}
