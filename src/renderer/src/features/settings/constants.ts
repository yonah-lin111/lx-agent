import { Bot, type LucideIcon, Server, Settings as SettingsIcon, Shield } from "lucide-react"

export interface SettingsSection {
  id: string
  labelKey: "settings.general" | "settings.models" | "settings.providers" | "settings.permissions"
  icon: LucideIcon
}

// 设置页面分区。
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", labelKey: "settings.general", icon: SettingsIcon },
  { id: "models", labelKey: "settings.models", icon: Bot },
  { id: "providers", labelKey: "settings.providers", icon: Server },
  { id: "permissions", labelKey: "settings.permissions", icon: Shield },
] as const
