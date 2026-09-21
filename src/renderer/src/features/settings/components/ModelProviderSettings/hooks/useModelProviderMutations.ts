import type { ModelPricing } from "@shared/contracts/usage"
import type React from "react"
import { useCallback, useEffect } from "react"
import type { ModelProvider, ModelProviderSettingsData } from "@/features/settings/types"
import { OPENCODE_GO_PRESET } from "../constants"
import type { UpdateProviderFn } from "../types"
import { applyOpencodeGoPreset, createProviderId } from "../utils"

type UseModelProviderMutationsOptions = {
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
  selectedProviderId: string
  setSelectedProviderId: React.Dispatch<React.SetStateAction<string>>
  onRegisterAddProvider?: (fn: () => void) => void
  onAddProvider?: () => void
  onDeleteProvider?: (providerId: string) => void
}

type UseModelProviderMutationsResult = {
  updateProvider: UpdateProviderFn
  updateModelPricing: (modelKey: string, field: keyof ModelPricing, rawValue: string) => void
  toggleProviderEnabled: (providerKey: string, enabled: boolean) => void
  deleteProvider: (providerId: string) => void
  duplicateProvider: (providerId: string) => void
  addModel: (providerId: string) => void
  duplicateModel: (providerId: string, modelKey: string) => void
  addOpencodeGoPreset: () => void
}

/**
 * Provider 与模型的本地变更操作；仅通过 setSettings 提交状态迁移。
 */
export const useModelProviderMutations = ({
  setSettings,
  selectedProviderId,
  setSelectedProviderId,
  onRegisterAddProvider,
  onAddProvider,
  onDeleteProvider,
}: UseModelProviderMutationsOptions): UseModelProviderMutationsResult => {
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

  // 更新模型计价字段：空值按 0；四项全为 0 时移除 pricing（视为未配置）。
  const updateModelPricing = (
    modelKey: string,
    field: keyof ModelPricing,
    rawValue: string,
  ): void => {
    updateProvider(selectedProviderId, (provider) => {
      const currentModel = provider.models[modelKey]
      const nextPricing: ModelPricing = {
        input: currentModel.pricing?.input ?? 0,
        output: currentModel.pricing?.output ?? 0,
        cacheRead: currentModel.pricing?.cacheRead ?? 0,
        cacheWrite: currentModel.pricing?.cacheWrite ?? 0,
      }
      const parsed = rawValue === "" ? 0 : Number(rawValue)
      nextPricing[field] = Number.isFinite(parsed) && parsed > 0 ? parsed : 0
      const hasAnyPrice =
        nextPricing.input > 0 ||
        nextPricing.output > 0 ||
        nextPricing.cacheRead > 0 ||
        nextPricing.cacheWrite > 0
      return {
        ...provider,
        models: {
          ...provider.models,
          [modelKey]: { ...currentModel, pricing: hasAnyPrice ? nextPricing : undefined },
        },
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
  }, [setSettings, onAddProvider, setSelectedProviderId])

  useEffect(() => {
    onRegisterAddProvider?.(addProvider)
  }, [onRegisterAddProvider, addProvider])

  // 一键创建 OpenCode Go 预设（幂等，已存在时跳过；专属成功提示由调用方展示，不触发通用 onAddProvider）。
  const addOpencodeGoPreset = useCallback((): void => {
    setSettings((current) => {
      if (!current) return current
      const next = applyOpencodeGoPreset(current.providers, current.enabledProviders)
      if (!next.added) return current
      setSelectedProviderId(OPENCODE_GO_PRESET.id)
      return { ...current, providers: next.providers, enabledProviders: next.enabledProviders }
    })
  }, [setSettings, setSelectedProviderId])

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

  return {
    updateProvider,
    updateModelPricing,
    toggleProviderEnabled,
    deleteProvider,
    duplicateProvider,
    addModel,
    duplicateModel,
    addOpencodeGoPreset,
  }
}
