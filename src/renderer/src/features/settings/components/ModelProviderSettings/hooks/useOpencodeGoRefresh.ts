import type React from "react"
import { useState } from "react"
import { useLxToast } from "@/components/ui/LxToast"
import { settingsApi } from "@/features/settings/api/settingsApi"
import type { ModelProviderSettingsData } from "@/features/settings/types"
import { useTranslation } from "@/i18n"

type UseOpencodeGoRefreshOptions = {
  setSettings: React.Dispatch<React.SetStateAction<ModelProviderSettingsData | null>>
}

type UseOpencodeGoRefreshResult = {
  isRefreshing: boolean
  refreshOpencodeGo: () => Promise<void>
}

/**
 * 云端刷新 OpenCode Go 的模型与思考等级：main 全量更新内置记录后重读配置。
 */
export const useOpencodeGoRefresh = ({
  setSettings,
}: UseOpencodeGoRefreshOptions): UseOpencodeGoRefreshResult => {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const toast = useLxToast()
  const { t } = useTranslation()

  const refreshOpencodeGo = async (): Promise<void> => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      const result = await settingsApi.refreshOpencodeGo()
      setSettings(await settingsApi.getModelProviders())
      toast.success(
        t("settings.refreshOpencodeGoSuccess", {
          added: result.added.length,
          updated: result.updated.length,
        }),
      )
    } catch {
      toast.error(t("settings.refreshOpencodeGoFailed"))
    } finally {
      setIsRefreshing(false)
    }
  }

  return { isRefreshing, refreshOpencodeGo }
}
