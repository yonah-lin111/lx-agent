import { useState } from "react"
import { settingsApi } from "../api/settingsApi"
import type { ModelProviderSettingsData } from "../types"

/**
 * 保存模型设置的 Hook。
 */
export const useSettingsMutations = (): {
  isSaving: boolean
  saveSettings: (settings: ModelProviderSettingsData) => Promise<ModelProviderSettingsData>
} => {
  const [isSaving, setIsSaving] = useState<boolean>(false)

  const saveSettings = async (
    settings: ModelProviderSettingsData,
  ): Promise<ModelProviderSettingsData> => {
    setIsSaving(true)
    try {
      return await settingsApi.saveModelProviders(settings)
    } finally {
      setIsSaving(false)
    }
  }

  return {
    isSaving,
    saveSettings,
  }
}
