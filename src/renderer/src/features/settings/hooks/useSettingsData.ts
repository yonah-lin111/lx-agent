import { useEffect, useState } from "react"
import { settingsApi } from "../api/settingsApi"
import type { ModelProviderSettingsData } from "../types"

/**
 * 获取并管理模型设置数据的 Hook。
 */
export const useSettingsData = (): {
  settings: ModelProviderSettingsData | null
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
  isLoading: boolean
  error: string
  setError: React.Dispatch<React.SetStateAction<string>>
  reloadSettings: () => Promise<void>
} => {
  const [settings, setSettings] = useState<ModelProviderSettingsData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string>("")

  const reloadSettings = async (): Promise<void> => {
    setIsLoading(true)
    setError("")
    try {
      const data = await settingsApi.getModelProviders()
      setSettings(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取配置文件")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reloadSettings()
  }, [])

  return {
    settings,
    setSettings,
    isLoading,
    error,
    setError,
    reloadSettings,
  }
}
