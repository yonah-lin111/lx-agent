import type { OpenClawInstanceConfig, OpenClawSettings } from "@shared/settings"
import { useCallback, useEffect, useMemo, useState } from "react"
import { settingsApi, subscribeSettingsChanged } from "@/features/settings"

// 合法的空配置，避免每次渲染产生新对象引用。
const EMPTY_INSTANCES: OpenClawSettings["instances"] = {}

export interface EnabledOpenClawInstance {
  id: string
  instance: OpenClawInstanceConfig
}

export interface UseOpenClawConfigResult {
  instances: OpenClawSettings["instances"]
  enabledInstances: EnabledOpenClawInstance[]
}

/**
 * 加载并订阅 OpenClaw 实例配置：设置页保存后自动刷新。
 */
export const useOpenClawConfig = (): UseOpenClawConfigResult => {
  const [instances, setInstances] = useState<OpenClawSettings["instances"]>(EMPTY_INSTANCES)

  const load = useCallback(async (): Promise<void> => {
    try {
      const loaded = await settingsApi.getOpenClawSettings()
      setInstances(loaded.instances ?? EMPTY_INSTANCES)
    } catch (error) {
      console.error("[useOpenClawConfig] Failed to load settings:", error)
    }
  }, [])

  useEffect(() => {
    void load()
    return subscribeSettingsChanged("openclaw", () => {
      void load()
    })
  }, [load])

  const enabledInstances = useMemo<EnabledOpenClawInstance[]>(
    () =>
      Object.entries(instances)
        .filter(([, instance]) => instance.enabled)
        .map(([id, instance]) => ({ id, instance })),
    [instances],
  )

  return { instances, enabledInstances }
}
