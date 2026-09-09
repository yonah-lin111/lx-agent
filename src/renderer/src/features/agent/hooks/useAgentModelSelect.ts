import type { ModelSelection } from "@shared/settings"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { LxSelectGroup, LxSelectOption } from "@/components/ui/LxSelect"
import type { ModelProviderSettingsData } from "@/features/settings/types"
import { useTranslation } from "@/i18n"
import { getModelDisplayName, modelsStore } from "./modelsStore"

// localStorage 中保存上次所选模型的键。
const STORAGE_KEY = "agent-selected-model"

// 校验模型选择在当前已启用 Provider 中是否有效。
const isValidSelection = (
  selection: ModelSelection | undefined,
  settings: ModelProviderSettingsData,
): selection is ModelSelection => {
  if (!selection?.provider || !selection.model) return false
  const provider = settings.providers[selection.provider]
  return Boolean(
    provider && settings.enabledProviders.includes(provider.id) && provider.models[selection.model],
  )
}

// 读取 localStorage 中保存的模型选择。
const readSavedSelection = (): ModelSelection | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const parsed = JSON.parse(saved) as unknown
    if (parsed && typeof parsed === "object") {
      const selection = parsed as Record<string, unknown>
      if (typeof selection.provider === "string" && typeof selection.model === "string") {
        return {
          provider: selection.provider,
          model: selection.model,
          variant: typeof selection.variant === "string" ? selection.variant : undefined,
        }
      }
    }
  } catch {
    // 忽略解析可能出现的异常。
  }
  return null
}

/**
 * useAgentModelSelect - 管理 Agent 模型选择：基于 modelsStore 加载已启用 Provider、构建分组选项、
 * 持久化所选模型与思考等级，并在持久化失效时回退到系统默认模型。
 */
export const useAgentModelSelect = () => {
  const settings = useSyncExternalStore(modelsStore.subscribe, modelsStore.getSettings)
  const [selectedModel, setSelectedModel] = useState<string>("")
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(undefined)

  // 配置数据更新后同步校验并恢复/回退模型选择
  useEffect(() => {
    if (!settings) {
      setSelectedModel("")
      setSelectedVariant(undefined)
      return
    }
    const saved = readSavedSelection()
    if (saved && isValidSelection(saved, settings)) {
      setSelectedModel(`${saved.provider}::${saved.model}`)
      const modelConfig = settings.providers[saved.provider]?.models[saved.model]
      const validVariant =
        saved.variant && modelConfig?.variants && modelConfig.variants[saved.variant]
          ? saved.variant
          : (modelConfig?.variant ??
            (modelConfig?.variants ? Object.keys(modelConfig.variants)[0] : undefined))
      setSelectedVariant(validVariant)
    } else if (isValidSelection(settings.defaultModel, settings)) {
      const def = settings.defaultModel
      setSelectedModel(`${def.provider}::${def.model}`)
      const modelConfig = settings.providers[def.provider]?.models[def.model]
      const validVariant =
        def.variant && modelConfig?.variants && modelConfig.variants[def.variant]
          ? def.variant
          : (modelConfig?.variant ??
            (modelConfig?.variants ? Object.keys(modelConfig.variants)[0] : undefined))
      setSelectedVariant(validVariant)
    } else {
      setSelectedModel("")
      setSelectedVariant(undefined)
    }
  }, [settings])

  const { t } = useTranslation()

  // 解析当前选中的 provider / model 配置对象
  const currentModelConfig = useMemo(() => {
    if (!settings || !selectedModel) return undefined
    const [providerId, modelId] = selectedModel.split("::")
    if (!providerId || !modelId) return undefined
    return settings.providers[providerId]?.models[modelId]
  }, [settings, selectedModel])

  // 当前模型支持的所有 variants
  const availableVariants = useMemo(() => {
    if (!currentModelConfig?.variants) return []
    return Object.keys(currentModelConfig.variants)
  }, [currentModelConfig])

  // 已启用 Provider 下的分组模型选项。
  const selectOptions = useMemo<(LxSelectOption<string> | LxSelectGroup<string>)[]>(() => {
    if (!settings) return [{ value: "", label: t("agent.noAvailableModels") }]
    const groups = settings.enabledProviders
      .map((providerId) => settings.providers[providerId])
      .filter((provider) => provider && Object.keys(provider.models).length > 0)
      .map((provider) => ({
        label: provider.name || provider.id,
        options: Object.values(provider.models).map((model) => ({
          value: `${provider.id}::${model.id}`,
          label: model.name || model.id,
          variants: model.variants ? Object.keys(model.variants) : undefined,
          defaultVariant:
            model.variant ?? (model.variants ? Object.keys(model.variants)[0] : undefined),
        })),
      }))
    return groups.length > 0 ? groups : [{ value: "", label: t("agent.noAvailableModels") }]
  }, [settings, t])

  const hasModelOptions = useMemo(
    () =>
      Boolean(
        settings &&
          settings.enabledProviders.some(
            (providerId) =>
              settings.providers[providerId] &&
              Object.keys(settings.providers[providerId].models).length > 0,
          ),
      ),
    [settings],
  )

  // 解析为发送给 main 进程的模型选择。
  const selectedSelection = useMemo<ModelSelection | undefined>(() => {
    const [provider, model] = selectedModel.split("::")
    return provider && model
      ? {
          provider,
          model,
          ...(selectedVariant ? { variant: selectedVariant } : {}),
        }
      : undefined
  }, [selectedModel, selectedVariant])

  const handleModelChange = useCallback(
    (value: string, explicitVariant?: string) => {
      setSelectedModel(value)
      const [provider, model] = value.split("::")
      let variantToSet: string | undefined = explicitVariant
      if (provider && model && settings) {
        const modelConfig = settings.providers[provider]?.models[model]
        if (variantToSet === undefined) {
          variantToSet =
            modelConfig?.variant ??
            (modelConfig?.variants ? Object.keys(modelConfig.variants)[0] : undefined)
        }
        setSelectedVariant(variantToSet)
        try {
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              provider,
              model,
              ...(variantToSet ? { variant: variantToSet } : {}),
            }),
          )
        } catch {
          // 忽略可能存在的 Storage 写入异常。
        }
      }
    },
    [settings],
  )

  const handleVariantChange = useCallback(
    (variant: string) => {
      setSelectedVariant(variant)
      const [provider, model] = selectedModel.split("::")
      if (provider && model) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider, model, variant }))
        } catch {
          // 忽略可能存在的 Storage 写入异常。
        }
      }
    },
    [selectedModel],
  )

  // 推荐问题开关：设置页停用后不再触发生成请求；设置加载完成前按启用处理（保持原行为）。
  const suggestedQuestionsEnabled = settings?.suggestedQuestionsEnabled !== false

  return {
    selectedModel,
    selectedVariant,
    availableVariants,
    selectedSelection,
    hasModelOptions,
    selectOptions,
    handleModelChange,
    handleVariantChange,
    suggestedQuestionsEnabled,
    settings,
    getModelDisplayName: (modelId?: string, providerId?: string) =>
      getModelDisplayName(modelId, providerId, settings),
  }
}
