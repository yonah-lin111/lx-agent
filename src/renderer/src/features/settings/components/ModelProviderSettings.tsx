import { AlertCircle, KeyRound, Save, SlidersHorizontal } from "lucide-react"
import { useEffect, useState } from "react"
import { LxCheckbox } from "@/components/ui/LxCheckbox"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxSelect } from "@/components/ui/LxSelect"
import { useSettingsData } from "../hooks/useSettingsData"
import { useSettingsMutations } from "../hooks/useSettingsMutations"
import type { ModelProvider } from "../types"

const PROVIDER_TYPES: ModelProvider["type"][] = [
  "openai-compatible",
  "openai",
  "anthropic",
  "google",
]

/**
 * 生成未占用的 Provider 标识。
 */
const createProviderId = (providers: Record<string, ModelProvider>): string => {
  let index = Object.keys(providers).length + 1
  let id = `provider-${index}`
  while (providers[id]) {
    index += 1
    id = `provider-${index}`
  }
  return id
}

/**
 * 渲染模型 Provider 的读取、编辑和保存界面。
 */
export const ModelProviderSettings = (): React.JSX.Element => {
  const { settings, setSettings, isLoading, error, setError } = useSettingsData()
  const { isSaving, saveSettings } = useSettingsMutations()
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [expandedModelKeys, setExpandedModelKeys] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (settings && !selectedProviderId) {
      setSelectedProviderId(Object.keys(settings.providers)[0] ?? "")
    }
  }, [settings, selectedProviderId])

  useEffect(() => {
    if (settings && selectedProviderId && !settings.providers[selectedProviderId]) {
      setSelectedProviderId(Object.keys(settings.providers)[0] ?? "")
    }
  }, [selectedProviderId, settings])

  const updateProvider = (
    providerId: string,
    updater: (provider: ModelProvider) => ModelProvider,
  ): void => {
    setSettings((current) => {
      if (!current?.providers[providerId]) return current
      return {
        ...current,
        providers: { ...current.providers, [providerId]: updater(current.providers[providerId]) },
      }
    })
  }

  const addProvider = (): void => {
    setSettings((current) => {
      if (!current) return current
      const id = createProviderId(current.providers)
      setSelectedProviderId(id)
      return {
        ...current,
        enabledProviders: [...current.enabledProviders, id],
        providers: {
          ...current.providers,
          [id]: {
            id,
            name: id,
            type: "openai-compatible",
            options: { apiKey: "", baseURL: "" },
            models: {},
          },
        },
      }
    })
  }

  const deleteProvider = (providerId: string): void => {
    setSettings((current) => {
      if (!current) return current
      const providers = { ...current.providers }
      delete providers[providerId]
      return {
        ...current,
        providers,
        enabledProviders: current.enabledProviders.filter((id) => id !== providerId),
      }
    })
  }

  const addModel = (providerId: string): void => {
    updateProvider(providerId, (provider) => {
      let index = Object.keys(provider.models).length + 1
      let id = `model-${index}`
      while (provider.models[id]) {
        index += 1
        id = `model-${index}`
      }
      return {
        ...provider,
        models: {
          ...provider.models,
          [id]: {
            id,
            name: id,
            limit: { context: 8192, output: 4096 },
            modalities: { input: ["text"], output: ["text"] },
          },
        },
      }
    })
  }

  const save = async (): Promise<void> => {
    if (!settings) return
    setError("")
    try {
      const savedSettings = await saveSettings(settings)
      setSettings(savedSettings)
      setSelectedProviderId((current) =>
        savedSettings.providers[current]
          ? current
          : (Object.keys(savedSettings.providers)[0] ?? ""),
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存配置失败")
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-white/45">
        正在读取配置...
      </div>
    )
  }

  if (!settings) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-rose-300">
        <AlertCircle className="h-5 w-5" />
        <span>{error || "无法读取配置"}</span>
      </div>
    )
  }

  const selectedProvider = settings.providers[selectedProviderId]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <p className="mt-1 text-xs text-white/45">保存后立即写入 ~/.lx/config.json</p>
        </div>
        <div className="flex items-center gap-1">
          <LxIconButton
            preset="add"
            aria-label="添加 Provider"
            title={{ content: "添加 Provider", placement: "bottom" }}
            onClick={addProvider}
          />
          <LxIconButton
            preset="save"
            aria-label="保存 Provider 配置"
            title={{ content: "保存配置", placement: "bottom" }}
            disabled={isSaving}
            onClick={() => void save()}
          >
            <Save className="h-4 w-4" />
          </LxIconButton>
        </div>
      </div>

      {error ? <p className="shrink-0 text-xs text-rose-300">{error}</p> : null}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          className="min-h-0 overflow-y-auto border-r border-white/8 pr-2"
          aria-label="模型 Provider 列表"
        >
          <div className="flex flex-col gap-1">
            {Object.entries(settings.providers).map(([providerKey, provider]) => {
              const isSelected = providerKey === selectedProviderId
              const isEnabled = settings.enabledProviders.includes(providerKey)
              return (
                <button
                  key={providerKey}
                  type="button"
                  className={`rounded-[6px] px-3 py-2 text-left transition-colors ${
                    isSelected
                      ? "bg-white text-black"
                      : "text-white/65 hover:bg-white/5 hover:text-white"
                  }`}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => setSelectedProviderId(providerKey)}
                >
                  <span className="block truncate text-sm">{provider.name || provider.id}</span>
                  <span
                    className={`block text-xs ${isSelected ? "text-black/60" : "text-white/35"}`}
                  >
                    {provider.type} · {isEnabled ? "已启用" : "已停用"}
                  </span>
                </button>
              )
            })}
          </div>
        </nav>

        {selectedProvider ? (
          <div className="min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1.5 text-xs text-white/55">
                Provider ID
                <LxInput
                  value={selectedProvider.id}
                  onChange={(event) =>
                    updateProvider(selectedProviderId, (provider) => ({
                      ...provider,
                      id: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs text-white/55">
                显示名称
                <LxInput
                  value={selectedProvider.name}
                  onChange={(event) =>
                    updateProvider(selectedProviderId, (provider) => ({
                      ...provider,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs text-white/55">
                传输格式
                <LxSelect
                  value={selectedProvider.type}
                  options={PROVIDER_TYPES.map((type) => ({ value: type, label: type }))}
                  onChange={(event) =>
                    updateProvider(selectedProviderId, (provider) => ({
                      ...provider,
                      type: event,
                    }))
                  }
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-xs text-white/65">
                <LxCheckbox
                  checked={settings.enabledProviders.includes(selectedProviderId)}
                  onChange={(checked) =>
                    setSettings((current) => {
                      if (!current) return current
                      return {
                        ...current,
                        enabledProviders: checked
                          ? Array.from(new Set([...current.enabledProviders, selectedProviderId]))
                          : current.enabledProviders.filter((id) => id !== selectedProviderId),
                      }
                    })
                  }
                />
                启用此 Provider
              </label>
              <label className="grid gap-1.5 text-xs text-white/55 md:col-span-2">
                Base URL
                <LxInput
                  value={selectedProvider.options.baseURL}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) =>
                    updateProvider(selectedProviderId, (provider) => ({
                      ...provider,
                      options: { ...provider.options, baseURL: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="grid gap-1.5 text-xs text-white/55 md:col-span-2">
                API Key
                <LxInput
                  type="password"
                  value={selectedProvider.options.apiKey}
                  prefix={<KeyRound className="h-3.5 w-3.5 text-white/35" />}
                  onChange={(event) =>
                    updateProvider(selectedProviderId, (provider) => ({
                      ...provider,
                      options: { ...provider.options, apiKey: event.target.value },
                    }))
                  }
                />
              </label>
            </div>

            <div className="mt-5 border-t border-white/8 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">模型</h3>
                <LxIconButton
                  preset="add"
                  size="small"
                  aria-label="添加模型"
                  title={{ content: "添加模型", placement: "left" }}
                  onClick={() => addModel(selectedProviderId)}
                />
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {Object.entries(selectedProvider.models).map(([modelKey, model]) => (
                  <div key={modelKey} className="rounded-[6px] border border-white/8 p-2">
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
                      <label className="grid gap-1.5 text-xs text-white/55">
                        模型 ID
                        <LxInput
                          aria-label={`${modelKey} 模型 ID`}
                          value={model.id}
                          onChange={(event) =>
                            updateProvider(selectedProviderId, (provider) => ({
                              ...provider,
                              models: {
                                ...provider.models,
                                [modelKey]: {
                                  ...provider.models[modelKey],
                                  id: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-1.5 text-xs text-white/55">
                        显示名称
                        <LxInput
                          aria-label={`${modelKey} 模型名称`}
                          value={model.name}
                          onChange={(event) =>
                            updateProvider(selectedProviderId, (provider) => ({
                              ...provider,
                              models: {
                                ...provider.models,
                                [modelKey]: {
                                  ...provider.models[modelKey],
                                  name: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <LxIconButton
                        className="mt-[22px]"
                        aria-label={`模型 ${model.id} 高级设置`}
                        title={{ content: "高级设置", placement: "top" }}
                        highlighted={expandedModelKeys[`${selectedProviderId}:${modelKey}`]}
                        onClick={() =>
                          setExpandedModelKeys((current) => ({
                            ...current,
                            [`${selectedProviderId}:${modelKey}`]:
                              !current[`${selectedProviderId}:${modelKey}`],
                          }))
                        }
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                      </LxIconButton>
                      <LxIconButton
                        className="mt-[22px]"
                        preset="delete"
                        size="small"
                        aria-label={`删除模型 ${model.id}`}
                        title={{ content: "删除模型", placement: "left" }}
                        onClick={() =>
                          updateProvider(selectedProviderId, (provider) => {
                            const models = { ...provider.models }
                            delete models[modelKey]
                            return { ...provider, models }
                          })
                        }
                      />
                    </div>
                    {expandedModelKeys[`${selectedProviderId}:${modelKey}`] ? (
                      <div className="mt-3 grid gap-3 border-t border-white/8 pt-3 md:grid-cols-4">
                        <label className="grid gap-1.5 text-xs text-white/55">
                          上下文限制
                          <LxInput
                            type="number"
                            aria-label={`${modelKey} 上下文限制`}
                            value={model.limit?.context ?? 8192}
                            onChange={(event) =>
                              updateProvider(selectedProviderId, (provider) => ({
                                ...provider,
                                models: {
                                  ...provider.models,
                                  [modelKey]: {
                                    ...provider.models[modelKey],
                                    limit: {
                                      context: Number(event.target.value),
                                      output: provider.models[modelKey].limit?.output ?? 4096,
                                    },
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs text-white/55">
                          最大输出限制
                          <LxInput
                            type="number"
                            value={model.limit?.output ?? 4096}
                            onChange={(event) =>
                              updateProvider(selectedProviderId, (provider) => ({
                                ...provider,
                                models: {
                                  ...provider.models,
                                  [modelKey]: {
                                    ...provider.models[modelKey],
                                    limit: {
                                      context: provider.models[modelKey].limit?.context ?? 8192,
                                      output: Number(event.target.value),
                                    },
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs text-white/55">
                          输入模态
                          <LxInput
                            value={(model.modalities?.input ?? ["text"]).join(", ")}
                            onChange={(event) =>
                              updateProvider(selectedProviderId, (provider) => ({
                                ...provider,
                                models: {
                                  ...provider.models,
                                  [modelKey]: {
                                    ...provider.models[modelKey],
                                    modalities: {
                                      input: event.target.value
                                        .split(",")
                                        .map((value) => value.trim())
                                        .filter(Boolean),
                                      output: provider.models[modelKey].modalities?.output ?? [
                                        "text",
                                      ],
                                    },
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-1.5 text-xs text-white/55">
                          输出模态
                          <LxInput
                            value={(model.modalities?.output ?? ["text"]).join(", ")}
                            onChange={(event) =>
                              updateProvider(selectedProviderId, (provider) => ({
                                ...provider,
                                models: {
                                  ...provider.models,
                                  [modelKey]: {
                                    ...provider.models[modelKey],
                                    modalities: {
                                      input: provider.models[modelKey].modalities?.input ?? [
                                        "text",
                                      ],
                                      output: event.target.value
                                        .split(",")
                                        .map((value) => value.trim())
                                        .filter(Boolean),
                                    },
                                  },
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 border-t border-white/8 pt-4">
              <LxIconButton
                preset="delete"
                iconOnly={false}
                aria-label="删除当前 Provider"
                title={{ content: "删除当前 Provider", placement: "top" }}
                onClick={() => deleteProvider(selectedProviderId)}
              >
                删除 Provider
              </LxIconButton>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-white/45">
            尚未配置 Provider
          </div>
        )}
      </div>
    </div>
  )
}
