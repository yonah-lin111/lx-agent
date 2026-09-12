import type { SubagentSettings } from "@shared/settings"
import { DEFAULT_SUBAGENT_SETTINGS } from "@shared/settings"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { settingsApi } from "../api/settingsApi"

// 子代理配置编辑态：加载 / 脏判定 / 保存 / 重置。
export const useSubagentSettings = (): {
  settings: SubagentSettings
  setSettings: React.Dispatch<React.SetStateAction<SubagentSettings>>
  isLoading: boolean
  loadFailed: boolean
  isDirty: boolean
  save: () => Promise<SubagentSettings>
  reset: () => void
} => {
  const [settings, setSettings] = useState<SubagentSettings>(DEFAULT_SUBAGENT_SETTINGS)
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const baselineRef = useRef<string | null>(null)

  useEffect(() => {
    void settingsApi
      .getSubagentSettings()
      .then((loaded) => {
        setSettings(loaded)
        baselineRef.current = JSON.stringify(loaded)
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setIsLoading(false))
  }, [])

  const isDirty = useMemo(
    () => baselineRef.current !== null && JSON.stringify(settings) !== baselineRef.current,
    [settings],
  )

  const save = useCallback(async (): Promise<SubagentSettings> => {
    const saved = await settingsApi.saveSubagentSettings(settings)
    setSettings(saved)
    baselineRef.current = JSON.stringify(saved)
    return saved
  }, [settings])

  const reset = useCallback((): void => {
    if (baselineRef.current !== null) {
      setSettings(JSON.parse(baselineRef.current) as SubagentSettings)
    }
  }, [])

  return { settings, setSettings, isLoading, loadFailed, isDirty, save, reset }
}
