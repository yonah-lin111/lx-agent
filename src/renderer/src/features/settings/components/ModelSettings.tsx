import { LxInfoTooltip } from "@/components/ui/LxInfoTooltip"
import { LxInput } from "@/components/ui/LxInput"
import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { LxSelect } from "@/components/ui/LxSelect"
import { type TranslationKey, useTranslation } from "@/i18n"
import type { ModelProviderSettingsData, ModelSelection } from "../types"

const MODEL_SELECTIONS: {
  key: keyof ModelProviderSettingsData & string
  labelKey: TranslationKey
}[] = [
  { key: "defaultModel", labelKey: "settings.defaultChatModel" },
  { key: "titleSummary", labelKey: "settings.titleSummaryModel" },
  { key: "suggestedQuestions", labelKey: "settings.suggestedQuestionsModel" },
  { key: "compactionModel", labelKey: "settings.compactionModel" },
]

export interface ModelSettingsProps {
  settings: ModelProviderSettingsData
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
}

/**
 * 渲染模型选择和推荐问题配置。
 */
export const ModelSettings = ({ settings, setSettings }: ModelSettingsProps): React.JSX.Element => {
  const { t } = useTranslation()

  const updateSelection = (key: string, selection: ModelSelection): void => {
    setSettings((current) => (current ? { ...current, [key]: selection } : current))
  }

  const providerOptions = (selection: ModelSelection, isCompaction: boolean) => {
    const baseOptions = Object.values(settings.providers)
      .filter(
        (provider) =>
          settings.enabledProviders.includes(provider.id) || provider.id === selection.provider,
      )
      .map((provider) => ({
        value: provider.id,
        label: provider.name || provider.id,
      }))

    if (isCompaction) {
      return [{ value: "", label: t("settings.followCurrentSessionModel") }, ...baseOptions]
    }
    return baseOptions
  }

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      {/* 提示信息说明与文档 */}
      <div className="flex items-center justify-between gap-2 rounded-[6px] border border-white/6 bg-white/[0.02] p-3 text-xs text-white/60 leading-relaxed">
        <div className="flex items-center gap-2">
          <span>{t("settings.modelsDesc")}</span>
          <LxInfoTooltip markdown={t("settings.modelsDoc")} placement="right" />
        </div>
      </div>

      <div>
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.defaultModels")}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          {MODEL_SELECTIONS.map(({ key, labelKey }) => {
            const isCompaction = key === "compactionModel"
            const selection = (settings[
              key as keyof ModelProviderSettingsData
            ] as ModelSelection) || { provider: "", model: "" }
            const models = settings.providers[selection.provider]?.models ?? {}
            return (
              <div
                key={key}
                className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3"
              >
                <h4 className="text-xs text-white/60">{t(labelKey)}</h4>
                <div className="grid gap-2">
                  <LxSelect
                    value={selection.provider}
                    options={providerOptions(selection, isCompaction)}
                    disabled={providerOptions(selection, isCompaction).length === 0}
                    onChange={(provider) =>
                      updateSelection(key, {
                        provider,
                        model: provider
                          ? (Object.keys(settings.providers[provider]?.models ?? {})[0] ?? "")
                          : "",
                      })
                    }
                  />
                  <LxSelect
                    value={selection.model}
                    options={Object.values(models).map((model) => ({
                      value: model.id,
                      label: model.name,
                    }))}
                    disabled={!selection.provider || Object.keys(models).length === 0}
                    onChange={(model) => updateSelection(key, { ...selection, model })}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="border-t border-white/8 pt-3">
        <h3 className="mb-2.5 text-sm font-medium text-white">{t("settings.featuresConfig")}</h3>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
            <h4 className="text-xs text-white/60">{t("settings.suggestedQuestions")}</h4>
            <div className="flex items-center">
              <LxRadioGroup
                className="flex gap-2"
                name="suggested-questions"
                value={settings.suggestedQuestionsEnabled ? "enabled" : "disabled"}
                onChange={(value) =>
                  setSettings((current) =>
                    current
                      ? { ...current, suggestedQuestionsEnabled: value === "enabled" }
                      : current,
                  )
                }
              >
                <LxRadio value="enabled" label={t("common.enable")} />
                <LxRadio value="disabled" label={t("common.disable")} />
              </LxRadioGroup>
            </div>
          </div>
          <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
            <h4 className="text-xs text-white/60">{t("settings.contextCompaction")}</h4>
            <div className="flex items-center">
              <LxRadioGroup
                className="flex gap-2"
                name="context-compaction"
                value={settings.compactionEnabled ? "enabled" : "disabled"}
                onChange={(value) =>
                  setSettings((current) =>
                    current ? { ...current, compactionEnabled: value === "enabled" } : current,
                  )
                }
              >
                <LxRadio value="enabled" label={t("common.enable")} />
                <LxRadio value="disabled" label={t("common.disable")} />
              </LxRadioGroup>
            </div>
          </div>
          <div className="settings-item-card flex flex-col gap-2 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
            <div className="flex flex-col gap-0.5">
              <h4 className="text-xs text-white/60">{t("settings.streamIdleTimeout")}</h4>
              <p className="text-[11px] text-white/40">{t("settings.streamIdleTimeoutDesc")}</p>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <div className="w-28">
                <LxInput
                  type="number"
                  min={0}
                  max={600}
                  step={5}
                  size="xs"
                  value={Math.round((settings.streamIdleTimeoutMs ?? 60_000) / 1000)}
                  onChange={(e) => {
                    const parsed = Number(e.target.value)
                    if (Number.isFinite(parsed) && parsed >= 0) {
                      setSettings((current) =>
                        current
                          ? { ...current, streamIdleTimeoutMs: Math.round(parsed * 1000) }
                          : current,
                      )
                    }
                  }}
                />
              </div>
              <span className="text-xs text-white/45">
                {(settings.streamIdleTimeoutMs ?? 60_000) === 0
                  ? t("settings.streamIdleTimeoutInfinite")
                  : t("settings.streamIdleTimeoutUnit")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
