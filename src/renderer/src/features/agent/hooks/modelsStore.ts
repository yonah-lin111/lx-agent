import type { ModelProviderSettings } from "@shared/settings"
import { useSyncExternalStore } from "react"
import { subscribeSettingsChanged } from "@/features/settings/settingsChangeNotifier"
import { modelsApi } from "../api/modelsApi"

let settings: ModelProviderSettings | null = null
let hasLoaded = false
const listeners = new Set<() => void>()

const notify = (): void => {
  listeners.forEach((listener) => listener())
}

const loadProviders = (): void => {
  if (typeof window === "undefined" || !window.api?.settings?.getModelProviders) {
    return
  }
  modelsApi
    .getProviders()
    .then((data) => {
      settings = data
      hasLoaded = true
      notify()
    })
    .catch(() => {
      settings = null
      hasLoaded = true
      notify()
    })
}

// 初始化加载并订阅模型配置变动通知
if (!hasLoaded) {
  loadProviders()
}
subscribeSettingsChanged("models", loadProviders)

/**
 * 根据 modelId（及可选 providerId）解析为人类可读的模型显示名称。
 * 若在已启用或已配置 Provider 中找到对应 model.name，则返回该 name；否则回退为原 modelId。
 */
export const getModelDisplayName = (
  modelId?: string,
  providerId?: string,
  currentSettings: ModelProviderSettings | null = settings,
): string => {
  if (!modelId) return ""
  if (!currentSettings) return modelId

  // 1. 若指定 providerId，优先在对应 provider 的 models 下查找
  if (providerId && currentSettings.providers?.[providerId]?.models?.[modelId]?.name) {
    return currentSettings.providers[providerId].models[modelId].name
  }

  // 2. 在已启用的 provider 中查找
  if (currentSettings.enabledProviders && currentSettings.providers) {
    for (const enabledId of currentSettings.enabledProviders) {
      const provider = currentSettings.providers[enabledId]
      if (provider?.models?.[modelId]?.name) {
        return provider.models[modelId].name
      }
    }
  }

  // 3. 在所有 provider 中查找
  if (currentSettings.providers) {
    for (const provider of Object.values(currentSettings.providers)) {
      if (provider?.models?.[modelId]?.name) {
        return provider.models[modelId].name
      }
    }
  }

  // 4. 未匹配到配置时回退为原 modelId
  return modelId
}

/**
 * 全局模型配置状态存储与订阅管理器。
 */
export const modelsStore = {
  getSettings: (): ModelProviderSettings | null => settings,
  subscribe: (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  reload: (): void => {
    loadProviders()
  },
  getModelDisplayName: (modelId?: string, providerId?: string): string => {
    return getModelDisplayName(modelId, providerId, settings)
  },
}

/**
 * 获取当前模型配置的 React Hook。
 */
export const useModelSettings = (): ModelProviderSettings | null => {
  return useSyncExternalStore(modelsStore.subscribe, modelsStore.getSettings)
}

/**
 * 获取模型显示名称的 React Hook。
 */
export const useModelDisplayName = (modelId?: string, providerId?: string): string => {
  const currentSettings = useModelSettings()
  return getModelDisplayName(modelId, providerId, currentSettings)
}
