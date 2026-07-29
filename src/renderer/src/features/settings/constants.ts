import { Bot, Server, type LucideIcon } from "lucide-react"

export interface SettingsSection {
  id: string
  label: string
  icon: LucideIcon
}

// 设置页面分区。
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "models", label: "模型配置", icon: Bot },
  { id: "providers", label: "模型 Provider", icon: Server },
] as const
