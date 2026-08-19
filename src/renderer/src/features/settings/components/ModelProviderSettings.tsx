import type { FetchedProviderModel } from "@shared/settings"
import {
  Bot,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  KeyRound,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { LxIconButton } from "@/components/ui/LxIconButton"
import { LxInput } from "@/components/ui/LxInput"
import { LxMenu, LxMenuItem, LxMenuSeparator } from "@/components/ui/LxMenu"
import { LxSelect } from "@/components/ui/LxSelect"
import { useLxToast } from "@/components/ui/LxToast"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { settingsApi } from "../api/settingsApi"
import type { ModelProvider, ModelProviderSettingsData } from "../types"

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
 * 将获取模型列表的错误转换为用户可读的中文提示。
 */
const toFetchModelsErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("HTTP 401") || message.includes("HTTP 403")) {
    return "认证失败，请检查 API Key"
  }
  if (
    message.includes("All candidates failed") ||
    message.includes("HTTP 404") ||
    message.includes("HTTP 405")
  ) {
    return "获取模型失败，请检查 Base URL 是否支持 /models 接口"
  }
  if (message.includes("timeout") || message.includes("timed out")) {
    return "请求超时"
  }
  if (message.includes("Failed to parse")) {
    return "响应格式不支持"
  }
  return "获取模型失败"
}

/**
 * 模糊匹配：查询串的字符需按顺序出现在目标串中即匹配（忽略大小写）。
 */
const fuzzyMatches = (target: string, query: string): boolean => {
  let index = 0
  for (const char of query) {
    index = target.indexOf(char, index)
    if (index === -1) return false
    index += 1
  }
  return true
}

type ProviderMenuState = {
  providerKey: string
  providerName: string
  isEnabled: boolean
  x: number
  y: number
}

type ModelProviderMenuProps = {
  isOpen: boolean
  providerName: string
  isEnabled: boolean
  x: number
  y: number
  onToggleEnabled: (enabled: boolean) => void
  onDuplicate: () => void
  onDelete: () => void
  onClose: () => void
}

/**
 * 渲染模型 Provider 右键操作菜单。
 */
const ModelProviderMenu = ({
  isOpen,
  providerName,
  isEnabled,
  x,
  y,
  onToggleEnabled,
  onDuplicate,
  onDelete,
  onClose,
}: ModelProviderMenuProps): React.JSX.Element | null => {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false)
  const [lastMenu, setLastMenu] = useState({ providerName, isEnabled, x, y })

  const displayedMenu = isOpen ? { providerName, isEnabled, x, y } : lastMenu

  useEffect(() => {
    if (isOpen) setLastMenu({ providerName, isEnabled, x, y })
  }, [isOpen, providerName, isEnabled, x, y])

  useEffect(() => {
    setIsConfirmingDelete(false)
  }, [isOpen, providerName])

  const handleDeleteClick = (): void => {
    if (!isConfirmingDelete) {
      setIsConfirmingDelete(true)
      return
    }
    onDelete()
  }

  return (
    <LxMenu
      ariaLabel={`${displayedMenu.providerName} 操作菜单`}
      isOpen={isOpen}
      x={displayedMenu.x}
      y={displayedMenu.y}
      onClose={onClose}
    >
      <LxMenuItem
        aria-checked={displayedMenu.isEnabled}
        leading={<span className="h-2 w-2 rounded-full bg-emerald-400/80" />}
        menuRole="menuitemradio"
        onClick={() => {
          onToggleEnabled(true)
          onClose()
        }}
        trailing={displayedMenu.isEnabled ? <Check className="h-3.5 w-3.5 text-white/70" /> : null}
      >
        启用
      </LxMenuItem>
      <LxMenuItem
        aria-checked={!displayedMenu.isEnabled}
        leading={<span className="h-2 w-2 rounded-full bg-white/40" />}
        menuRole="menuitemradio"
        onClick={() => {
          onToggleEnabled(false)
          onClose()
        }}
        trailing={!displayedMenu.isEnabled ? <Check className="h-3.5 w-3.5 text-white/70" /> : null}
      >
        停用
      </LxMenuItem>
      <LxMenuSeparator />
      <LxMenuItem
        leading={<Copy className="h-3.5 w-3.5 text-white/70" />}
        onClick={() => {
          onDuplicate()
          onClose()
        }}
      >
        复制 Provider
      </LxMenuItem>
      <LxMenuItem
        active={isConfirmingDelete}
        danger
        leading={
          <Trash2
            className={`h-3.5 w-3.5 ${isConfirmingDelete ? "text-white" : "text-rose-400/80"}`}
          />
        }
        onClick={handleDeleteClick}
      >
        {isConfirmingDelete ? "确认删除" : "删除 Provider"}
      </LxMenuItem>
    </LxMenu>
  )
}

export interface ModelProviderSettingsProps {
  settings: ModelProviderSettingsData
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
  onRegisterAddProvider?: (fn: () => void) => void
  onAddProvider?: () => void
  onDeleteProvider?: (providerId: string) => void
}

/**
 * 渲染模型 Provider 的读取、编辑和保存界面。
 */
export const ModelProviderSettings = ({
  settings,
  setSettings,
  onRegisterAddProvider,
  onAddProvider,
  onDeleteProvider,
}: ModelProviderSettingsProps): React.JSX.Element => {
  const [selectedProviderId, setSelectedProviderId] = useState<string>("")
  const [expandedModelKeys, setExpandedModelKeys] = useState<Record<string, boolean>>({})
  const [menuState, setMenuState] = useState<ProviderMenuState | null>(null)
  const [fetchedModels, setFetchedModels] = useState<Record<string, FetchedProviderModel[]>>({})
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false)
  const [modelListQuery, setModelListQuery] = useState<string>("")
  const toast = useLxToast()

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

  const toggleProviderEnabled = (providerKey: string, enabled: boolean): void => {
    setSettings((current) => {
      if (!current) return current
      return {
        ...current,
        enabledProviders: enabled
          ? Array.from(new Set([...current.enabledProviders, providerKey]))
          : current.enabledProviders.filter((id) => id !== providerKey),
      }
    })
  }

  const addProvider = useCallback((): void => {
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
    onAddProvider?.()
  }, [setSettings, onAddProvider])

  useEffect(() => {
    onRegisterAddProvider?.(addProvider)
  }, [onRegisterAddProvider, addProvider])

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
    onDeleteProvider?.(providerId)
  }

  const duplicateProvider = (providerId: string): void => {
    setSettings((current) => {
      if (!current) return current
      const source = current.providers[providerId]
      if (!source) return current
      const id = createProviderId(current.providers)
      setSelectedProviderId(id)
      return {
        ...current,
        providers: {
          ...current.providers,
          [id]: {
            ...source,
            id,
            name: `${source.name || source.id}-copy`,
            models: Object.fromEntries(
              Object.entries(source.models).map(([modelKey, model]) => [modelKey, { ...model }]),
            ),
          },
        },
        enabledProviders: current.enabledProviders.includes(providerId)
          ? [...current.enabledProviders, id]
          : current.enabledProviders,
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

  const duplicateModel = (providerId: string, modelKey: string): void => {
    updateProvider(providerId, (provider) => {
      const source = provider.models[modelKey]
      if (!source) return provider
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
          [id]: { ...source, name: `${source.name || source.id}-copy` },
        },
      }
    })
  }

  const invalidateFetchedModels = (providerId: string): void => {
    setFetchedModels((current) => {
      if (!(providerId in current)) return current
      const next = { ...current }
      delete next[providerId]
      return next
    })
  }

  const applyFetchedModel = (
    providerId: string,
    modelKey: string,
    fetched: FetchedProviderModel,
  ): void => {
    const models = settings.providers[providerId]?.models ?? {}
    const duplicateKey = Object.keys(models).find(
      (key) => key !== modelKey && models[key]?.id === fetched.id,
    )
    if (duplicateKey) {
      toast.error(`模型 ${fetched.id} 已存在`)
      return
    }
    updateProvider(providerId, (provider) => ({
      ...provider,
      models: {
        ...provider.models,
        [modelKey]: {
          ...provider.models[modelKey],
          id: fetched.id,
          name: fetched.id,
        },
      },
    }))
    toast.success(`已更新为模型 ${fetched.id}`)
  }

  const fetchProviderModels = async (providerId: string): Promise<void> => {
    const provider = settings.providers[providerId]
    if (!provider) return
    if (!provider.options.baseURL) {
      toast.error("请先填写 Base URL")
      return
    }
    if (!provider.options.apiKey) {
      toast.error("请先填写 API Key")
      return
    }
    setIsFetchingModels(true)
    try {
      const models = await settingsApi.fetchModels({
        baseURL: provider.options.baseURL,
        apiKey: provider.options.apiKey,
      })
      setFetchedModels((current) => ({ ...current, [providerId]: models }))
      toast.success(`获取到 ${models.length} 个模型`)
    } catch (error) {
      toast.error(toFetchModelsErrorMessage(error))
    } finally {
      setIsFetchingModels(false)
    }
  }

  const renderFetchedModelsContent = (providerId: string, modelKey: string): React.ReactNode => {
    const models = fetchedModels[providerId] ?? []
    const query = modelListQuery.trim().toLocaleLowerCase()
    const filteredModels = query
      ? models.filter((model) => fuzzyMatches(`${model.id} ${model.ownedBy ?? ""}`, query))
      : models
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 font-normal">
        <div onClick={(event) => event.stopPropagation()}>
          <LxInput
            aria-label="搜索模型"
            placeholder="搜索模型"
            prefix={<Search className="h-3.5 w-3.5 shrink-0 text-white/35" />}
            size="xs"
            value={modelListQuery}
            onChange={(event) => setModelListQuery(event.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {models.length === 0 ? (
            <div className="py-1 text-white/45">未获取到模型</div>
          ) : filteredModels.length === 0 ? (
            <div className="py-1 text-white/45">未找到匹配的模型</div>
          ) : (
            filteredModels.map((model) => (
              <button
                key={model.id}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded px-1 py-1 text-left text-xs text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                onClick={() => applyFetchedModel(providerId, modelKey, model)}
              >
                <span className="min-w-0 truncate">{model.id}</span>
                {model.ownedBy ? (
                  <span className="shrink-0 text-[10px] text-white/35">{model.ownedBy}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </div>
    )
  }

  const selectedProvider = settings.providers[selectedProviderId]

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
      <div className="grid min-h-0 flex-1 gap-3 @[520px]:grid-cols-[180px_minmax(0,1fr)]">
        <nav
          className="min-h-0 overflow-y-auto border-r border-white/8 pr-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          aria-label="模型 Provider 列表"
        >
          <div className="flex flex-col gap-1">
            {Object.entries(settings.providers).map(([providerKey, provider]) => {
              const isSelected = providerKey === selectedProviderId
              const isEnabled = settings.enabledProviders.includes(providerKey)
              return (
                <div
                  key={providerKey}
                  role="button"
                  tabIndex={0}
                  className={`flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                    isSelected
                      ? "bg-white/10 text-white"
                      : "text-white/65 hover:bg-white/[0.04] hover:text-white/90"
                  }`}
                  aria-current={isSelected ? "true" : undefined}
                  onClick={() => setSelectedProviderId(providerKey)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setMenuState({
                      providerKey,
                      providerName: provider.name || provider.id,
                      isEnabled,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setSelectedProviderId(providerKey)
                    }
                  }}
                >
                  <LxIconButton
                    size="small"
                    shape="circle"
                    showHoverBg={false}
                    aria-label={isEnabled ? "已启用" : "已停用"}
                    title={{ content: isEnabled ? "已启用" : "已停用" }}
                    className="-m-0.5 shrink-0"
                    onClick={(event) => {
                      event.stopPropagation()
                      toggleProviderEnabled(providerKey, !isEnabled)
                    }}
                  >
                    {isEnabled ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-white/30" />
                    )}
                  </LxIconButton>
                  <span className="min-w-0 flex-1 truncate select-none">
                    {provider.name || provider.id}
                  </span>
                </div>
              )
            })}
          </div>
        </nav>

        {selectedProvider ? (
          <div className="min-h-0 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <div className="settings-item-card rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
              <h3 className="mb-3 text-sm font-medium text-white">Provider</h3>
              <div className="grid gap-3 @[380px]:grid-cols-2">
                <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
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
                <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
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
                <label
                  className="grid gap-1.5 text-xs text-white/55 min-w-0 @[380px]:col-span-2"
                  onClick={(event) => event.preventDefault()}
                >
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
                <label className="grid gap-1.5 text-xs text-white/55 min-w-0 @[380px]:col-span-2">
                  Base URL
                  <LxInput
                    value={selectedProvider.options.baseURL}
                    placeholder="https://api.example.com/v1"
                    onChange={(event) => {
                      invalidateFetchedModels(selectedProviderId)
                      updateProvider(selectedProviderId, (provider) => ({
                        ...provider,
                        options: { ...provider.options, baseURL: event.target.value },
                      }))
                    }}
                  />
                </label>
                <label className="grid gap-1.5 text-xs text-white/55 min-w-0 @[380px]:col-span-2">
                  API Key
                  <LxInput
                    type="password"
                    value={selectedProvider.options.apiKey}
                    prefix={<KeyRound className="h-3.5 w-3.5 text-white/35" />}
                    onChange={(event) => {
                      invalidateFetchedModels(selectedProviderId)
                      updateProvider(selectedProviderId, (provider) => ({
                        ...provider,
                        options: { ...provider.options, apiKey: event.target.value },
                      }))
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="settings-item-card mt-4 rounded-[6px] border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">模型</h3>
                <div className="flex items-center gap-1">
                  <LxIconButton
                    size="small"
                    aria-label="获取模型列表"
                    title={{ content: "获取模型列表", placement: "top" }}
                    disabled={isFetchingModels}
                    onClick={() => void fetchProviderModels(selectedProviderId)}
                  >
                    <Download className="h-3 w-3" />
                  </LxIconButton>
                  <LxIconButton
                    preset="add"
                    size="small"
                    aria-label="添加模型"
                    title={{ content: "添加模型", placement: "top" }}
                    onClick={() => addModel(selectedProviderId)}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {Object.entries(selectedProvider.models).map(([modelKey, model]) => (
                  <div
                    key={modelKey}
                    className="settings-model-card rounded-[6px] border border-white/8 bg-white/[0.04] p-3"
                  >
                    <div className="grid gap-2 grid-cols-1 @[380px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
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
                      <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
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
                      <div className="flex items-center justify-end gap-1 @[380px]:mt-[22px]">
                        {fetchedModels[selectedProviderId] !== undefined ? (
                          <LxTooltip
                            placement="top"
                            trigger="click"
                            multiline
                            closeOnContentClick
                            contentClassName="w-[350px] h-[200px]"
                            content={renderFetchedModelsContent(selectedProviderId, modelKey)}
                          >
                            <LxIconButton aria-label={`模型 ${model.id} 模型列表`}>
                              <Bot className="h-3.5 w-3.5" />
                            </LxIconButton>
                          </LxTooltip>
                        ) : null}
                        <LxIconButton
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
                          aria-label={`复制模型 ${model.id}`}
                          title={{ content: "复制模型", placement: "top" }}
                          onClick={() => duplicateModel(selectedProviderId, modelKey)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </LxIconButton>
                        <LxIconButton
                          preset="delete"
                          aria-label={`删除模型 ${model.id}`}
                          title={{ content: "删除模型", placement: "top" }}
                          onClick={() =>
                            updateProvider(selectedProviderId, (provider) => {
                              const models = { ...provider.models }
                              delete models[modelKey]
                              return { ...provider, models }
                            })
                          }
                        />
                      </div>
                    </div>
                    <div
                      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                        expandedModelKeys[`${selectedProviderId}:${modelKey}`]
                          ? "grid-rows-[1fr]"
                          : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="mt-3 grid gap-3 border-t border-white/8 pt-3 @[360px]:grid-cols-2 @[580px]:grid-cols-4">
                          <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
                            上下文限制
                            <LxInput
                              type="number"
                              aria-label={`${modelKey} 上下文限制`}
                              value={model.limit?.context || ""}
                              onChange={(event) =>
                                updateProvider(selectedProviderId, (provider) => ({
                                  ...provider,
                                  models: {
                                    ...provider.models,
                                    [modelKey]: {
                                      ...provider.models[modelKey],
                                      limit: {
                                        context:
                                          event.target.value === ""
                                            ? 0
                                            : Number(event.target.value),
                                        output: provider.models[modelKey].limit?.output ?? 4096,
                                      },
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
                            最大输出限制
                            <LxInput
                              type="number"
                              aria-label={`${modelKey} 最大输出限制`}
                              value={model.limit?.output || ""}
                              onChange={(event) =>
                                updateProvider(selectedProviderId, (provider) => ({
                                  ...provider,
                                  models: {
                                    ...provider.models,
                                    [modelKey]: {
                                      ...provider.models[modelKey],
                                      limit: {
                                        context: provider.models[modelKey].limit?.context ?? 8192,
                                        output:
                                          event.target.value === ""
                                            ? 0
                                            : Number(event.target.value),
                                      },
                                    },
                                  },
                                }))
                              }
                            />
                          </label>
                          <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
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
                          <label className="grid gap-1.5 text-xs text-white/55 min-w-0">
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
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center text-sm text-white/45">
            尚未配置 Provider
          </div>
        )}
      </div>

      <ModelProviderMenu
        isOpen={menuState !== null}
        providerName={menuState?.providerName ?? ""}
        isEnabled={menuState?.isEnabled ?? false}
        x={menuState?.x ?? 0}
        y={menuState?.y ?? 0}
        onToggleEnabled={(enabled) => {
          if (menuState) toggleProviderEnabled(menuState.providerKey, enabled)
        }}
        onDuplicate={() => {
          if (menuState) duplicateProvider(menuState.providerKey)
        }}
        onDelete={() => {
          if (menuState) {
            deleteProvider(menuState.providerKey)
            setMenuState(null)
          }
        }}
        onClose={() => setMenuState(null)}
      />
    </div>
  )
}
