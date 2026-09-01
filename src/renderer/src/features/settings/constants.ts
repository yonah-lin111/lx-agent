import {
  Bot,
  Code,
  Code2,
  type LucideIcon,
  Plug,
  Server,
  Settings as SettingsIcon,
  Shield,
  Terminal,
} from "lucide-react"

export interface SettingsSection {
  id: string
  labelKey:
    | "settings.general"
    | "settings.models"
    | "settings.providers"
    | "settings.permissions"
    | "settings.customCommands"
    | "settings.cli"
    | "settings.lsp"
    | "settings.mcp"
  icon: LucideIcon
}

// 设置页面分区。
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", labelKey: "settings.general", icon: SettingsIcon },
  { id: "cli", labelKey: "settings.cli", icon: Terminal },
  { id: "lsp", labelKey: "settings.lsp", icon: Code2 },
  { id: "mcp", labelKey: "settings.mcp", icon: Plug },
  { id: "models", labelKey: "settings.models", icon: Bot },
  { id: "providers", labelKey: "settings.providers", icon: Server },
  { id: "permissions", labelKey: "settings.permissions", icon: Shield },
  { id: "custom-commands", labelKey: "settings.customCommands", icon: Code },
] as const
