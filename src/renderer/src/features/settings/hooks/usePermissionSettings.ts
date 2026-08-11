import type { PermissionSettings } from "@shared/contracts/agent"
import { useEffect, useState } from "react"
import { settingsApi } from "../api/settingsApi"

// 权限配置编辑态：加载 / 更新 / 错误。
export const usePermissionSettings = (): {
  permissionSettings: PermissionSettings | null
  setPermissionSettings: React.Dispatch<React.SetStateAction<PermissionSettings | null>>
  permissionError: string
} => {
  const [permissionSettings, setPermissionSettings] = useState<PermissionSettings | null>(null)
  const [permissionError, setPermissionError] = useState("")

  useEffect(() => {
    void settingsApi
      .getPermissionSettings()
      .then(setPermissionSettings)
      .catch(() => setPermissionError("无法读取权限配置"))
  }, [])

  return { permissionSettings, setPermissionSettings, permissionError }
}
