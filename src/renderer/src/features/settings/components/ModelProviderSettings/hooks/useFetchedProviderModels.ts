import type { FetchedProviderModel } from "@shared/settings"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { settingsApi } from "@/features/settings/api/settingsApi"
import type { ModelProviderSettingsData } from "@/features/settings/types"
import { useTranslation } from "@/i18n"
import type { UpdateProviderFn } from "../types"
import { toFetchModelsErrorMessage } from "../utils"

type UseFetchedProviderModelsOptions = {
  settings: ModelProviderSettingsData
  updateProvider: UpdateProviderFn
}

type UseFetchedProviderModelsResult = {
  fetchedModels: Record<string, FetchedProviderModel[]>
  isFetchingModels: boolean
  modelListQuery: string
  setModelListQuery: React.Dispatch<React.SetStateAction<string>>
  invalidateFetchedModels: (providerId: string) => void
  applyFetchedModel: (providerId: string, modelKey: string, fetched: FetchedProviderModel) => void
  fetchProviderModels: (providerId: string) => Promise<void>
}

/**
 * 从 Provider 端点取回模型列表并支持应用单个模型字段。
 */
export const useFetchedProviderModels = ({
  settings,
  updateProvider,
}: UseFetchedProviderModelsOptions): UseFetchedProviderModelsResult => {
  const [fetchedModels, setFetchedModels] = useState<Record<string, FetchedProviderModel[]>>({})
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false)
  const [modelListQuery, setModelListQuery] = useState<string>("")
  const toast = useLxToast()
  const { t } = useTranslation()

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
    toast.success(`${t("common.saved")}: ${fetched.id}`)
  }

  const fetchProviderModels = async (providerId: string): Promise<void> => {
    const provider = settings.providers[providerId]
    if (!provider) return
    if (!provider.options.baseURL) {
      toast.error(t("settings.baseUrl"))
      return
    }
    if (!provider.options.apiKey) {
      toast.error(t("settings.apiKey"))
      return
    }
    setIsFetchingModels(true)
    try {
      const models = await settingsApi.fetchModels({
        baseURL: provider.options.baseURL,
        apiKey: provider.options.apiKey,
      })
      setFetchedModels((current) => ({ ...current, [providerId]: models }))
      toast.success(t("settings.fetchModelsSuccess"))
    } catch (error) {
      toast.error(toFetchModelsErrorMessage(error))
    } finally {
      setIsFetchingModels(false)
    }
  }

  return {
    fetchedModels,
    isFetchingModels,
    modelListQuery,
    setModelListQuery,
    invalidateFetchedModels,
    applyFetchedModel,
    fetchProviderModels,
  }
}
