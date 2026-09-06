import {
  Bot,
  Code,
  Code2,
  type LucideIcon,
  Mic,
  Plug,
  Server,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
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
    | "settings.skills"
    | "settings.voice"
  icon: LucideIcon
}

// 设置页面分区。
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", labelKey: "settings.general", icon: SettingsIcon },
  { id: "cli", labelKey: "settings.cli", icon: Terminal },
  { id: "lsp", labelKey: "settings.lsp", icon: Code2 },
  { id: "mcp", labelKey: "settings.mcp", icon: Plug },
  { id: "skills", labelKey: "settings.skills", icon: Sparkles },
  { id: "models", labelKey: "settings.models", icon: Bot },
  { id: "providers", labelKey: "settings.providers", icon: Server },
  { id: "voice", labelKey: "settings.voice", icon: Mic },
  { id: "permissions", labelKey: "settings.permissions", icon: Shield },
  { id: "custom-commands", labelKey: "settings.customCommands", icon: Code },
] as const
