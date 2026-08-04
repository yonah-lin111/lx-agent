import { LxRadio, LxRadioGroup } from "@/components/ui/LxRadio"
import { LxSelect } from "@/components/ui/LxSelect"
import type { ModelProviderSettingsData, ModelSelection } from "../types"

const MODEL_SELECTIONS = [
  { key: "defaultModel", label: "默认对话模型" },
  { key: "titleSummary", label: "标题总结模型" },
  { key: "suggestedQuestions", label: "推荐问题模型" },
] as const

export interface ModelSettingsProps {
  settings: ModelProviderSettingsData
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
}

/**
 * 渲染模型选择和推荐问题配置。
 */
export const ModelSettings = ({ settings, setSettings }: ModelSettingsProps): React.JSX.Element => {
  const updateSelection = (
    key: (typeof MODEL_SELECTIONS)[number]["key"],
    selection: ModelSelection,
  ): void => {
    setSettings((current) => (current ? { ...current, [key]: selection } : current))
  }

  const providerOptions = (selection: ModelSelection) =>
    Object.values(settings.providers)
      .filter(
        (provider) =>
          settings.enabledProviders.includes(provider.id) || provider.id === selection.provider,
      )
      .map((provider) => ({
        value: provider.id,
        label: provider.name || provider.id,
      }))

  return (
    <div className="custom-scrollbar flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
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
                    options={providerOptions(selection)}
                    disabled={providerOptions(selection).length === 0}
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
                    current
                      ? { ...current, suggestedQuestionsEnabled: value === "enabled" }
                      : current,
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
