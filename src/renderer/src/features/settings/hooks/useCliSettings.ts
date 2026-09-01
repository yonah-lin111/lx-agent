import type { CliSettings } from "@shared/settings"
import { DEFAULT_CLI_SETTINGS } from "@shared/settings"
import { useEffect, useState } from "react"
import { settingsApi } from "../api/settingsApi"
import { subscribeSettingsChanged } from "../settingsChangeNotifier"

let cachedCliSettings: CliSettings = { ...DEFAULT_CLI_SETTINGS }
let hasLoaded = false

// 预加载 CLI 配置
const loadCliSettings = async (): Promise<CliSettings> => {
  if (typeof window === "undefined" || !window.api?.settings) {
    return cachedCliSettings
  }
  try {
    const settings = await settingsApi.getCliSettings()
    cachedCliSettings = settings
    hasLoaded = true
    return settings
  } catch (err) {
    console.warn("[useCliSettings] Failed to fetch CLI settings:", err)
    return cachedCliSettings
  }
}

// 立即触发一次异步初始化加载
if (typeof window !== "undefined" && window.api?.settings) {
  void loadCliSettings()
}


// 订阅 CLI 配置变更
subscribeSettingsChanged("cli", () => {
  void loadCliSettings()
})

/**
 * 同步获取当前缓存的 CLI 配置（供 Markdown Slash 命令等快速读取）。
 */
export const getCachedCliSettings = (): CliSettings => {
  if (!hasLoaded) {
    void loadCliSettings()
  }
  return cachedCliSettings
}

/**
 * React Hook：获取与监听 CLI 配置。
 */
export const useCliSettings = (): {
  cliSettings: CliSettings
  reload: () => Promise<void>
} => {
  const [cliSettings, setCliSettings] = useState<CliSettings>(cachedCliSettings)

  useEffect(() => {
    void loadCliSettings().then(setCliSettings)
    return subscribeSettingsChanged("cli", () => {
      void loadCliSettings().then(setCliSettings)
    })
  }, [])

  const reload = async () => {
    const updated = await loadCliSettings()
    setCliSettings(updated)
  }

  return { cliSettings, reload }
}
