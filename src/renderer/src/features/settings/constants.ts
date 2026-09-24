import {
  Bot,
  Code,
  Code2,
  Coins,
  Compass,
  FileText,
  type LucideIcon,
  Mic,
  Network,
  Plug,
  Server,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Terminal,
  Users,
  Webhook,
} from "lucide-react"

export interface SettingsSection {
  id: string
  labelKey:
    | "settings.general"
    | "settings.models"
    | "settings.providers"
    | "settings.permissions"
    | "settings.collaboration"
    | "settings.hooks"
    | "settings.subagents"
    | "settings.customCommands"
    | "settings.agentsMd"
    | "settings.cli"
    | "settings.lsp"
    | "settings.mcp"
    | "settings.skills"
    | "settings.tokenSaver"
    | "settings.voice"
    | "settings.openclaw"
  icon: LucideIcon
}

// 设置页面分区。
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", labelKey: "settings.general", icon: SettingsIcon },
  { id: "cli", labelKey: "settings.cli", icon: Terminal },
  { id: "lsp", labelKey: "settings.lsp", icon: Code2 },
  { id: "mcp", labelKey: "settings.mcp", icon: Plug },
  { id: "openclaw", labelKey: "settings.openclaw", icon: Network },
  { id: "skills", labelKey: "settings.skills", icon: Sparkles },
  { id: "agents-md", labelKey: "settings.agentsMd", icon: FileText },
  { id: "models", labelKey: "settings.models", icon: Bot },
  { id: "providers", labelKey: "settings.providers", icon: Server },
  { id: "token-saver", labelKey: "settings.tokenSaver", icon: Coins },
  { id: "voice", labelKey: "settings.voice", icon: Mic },
  { id: "permissions", labelKey: "settings.permissions", icon: Shield },
  { id: "collaboration", labelKey: "settings.collaboration", icon: Compass },
  { id: "hooks", labelKey: "settings.hooks", icon: Webhook },
  { id: "subagents", labelKey: "settings.subagents", icon: Users },
  { id: "custom-commands", labelKey: "settings.customCommands", icon: Code },
] as const
