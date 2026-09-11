import type { HookSettings } from "@shared/settings"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { settingsApi } from "../api/settingsApi"

// 钩子配置编辑态：加载 / 脏判定 / 保存 / 重置。
export const useHookSettings = (): {
  hooks: HookSettings
  setHooks: React.Dispatch<React.SetStateAction<HookSettings>>
  isLoading: boolean
  loadFailed: boolean
  isDirty: boolean
  save: () => Promise<HookSettings>
  reset: () => void
} => {
  const [hooks, setHooks] = useState<HookSettings>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const baselineRef = useRef<string | null>(null)

  useEffect(() => {
    void settingsApi
      .getHookSettings()
      .then((loaded) => {
        setHooks(loaded)
        baselineRef.current = JSON.stringify(loaded)
      })
      .catch(() => setLoadFailed(true))
      .finally(() => setIsLoading(false))
  }, [])

  const isDirty = useMemo(
    () => baselineRef.current !== null && JSON.stringify(hooks) !== baselineRef.current,
    [hooks],
  )

  const save = useCallback(async (): Promise<HookSettings> => {
    const saved = await settingsApi.saveHookSettings(hooks)
    setHooks(saved)
    baselineRef.current = JSON.stringify(saved)
    return saved
  }, [hooks])

  const reset = useCallback((): void => {
    if (baselineRef.current !== null) {
      setHooks(JSON.parse(baselineRef.current) as HookSettings)
    }
  }, [])

  return { hooks, setHooks, isLoading, loadFailed, isDirty, save, reset }
}
