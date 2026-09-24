import {
  Bot,
  BrainCircuit,
  Cable,
  Code,
  Code2,
  Coins,
  Cpu,
  FileText,
  type LucideIcon,
  Mic,
  Network,
  Plug,
  Puzzle,
  Server,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Users,
  Webhook,
  Workflow,
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

// 设置页左侧导航分组标签键。
export type SettingsGroupLabelKey =
  | "settings.groupGeneral"
  | "settings.groupModels"
  | "settings.groupAgent"
  | "settings.groupCapabilities"
  | "settings.groupIntegrations"

// 设置页左侧导航分组：仅用于分类折叠，分组本身不可导航。
export interface SettingsNavGroup {
  id: string
  labelKey: SettingsGroupLabelKey
  icon: LucideIcon
  sections: readonly SettingsSection[]
}

// 设置页面分组导航（顺序即展示顺序）。
export const SETTINGS_NAV_GROUPS: readonly SettingsNavGroup[] = [
  {
    id: "general",
    labelKey: "settings.groupGeneral",
    icon: SlidersHorizontal,
    sections: [
      { id: "general", labelKey: "settings.general", icon: SettingsIcon },
      { id: "voice", labelKey: "settings.voice", icon: Mic },
    ],
  },
  {
    id: "models",
    labelKey: "settings.groupModels",
    icon: Cpu,
    sections: [
      { id: "models", labelKey: "settings.models", icon: Bot },
      { id: "providers", labelKey: "settings.providers", icon: Server },
      { id: "token-saver", labelKey: "settings.tokenSaver", icon: Coins },
    ],
  },
  {
    id: "agent",
    labelKey: "settings.groupAgent",
    icon: BrainCircuit,
    sections: [
      { id: "permissions", labelKey: "settings.permissions", icon: Shield },
      { id: "collaboration", labelKey: "settings.collaboration", icon: Workflow },
      { id: "subagents", labelKey: "settings.subagents", icon: Users },
      { id: "hooks", labelKey: "settings.hooks", icon: Webhook },
    ],
  },
  {
    id: "capabilities",
    labelKey: "settings.groupCapabilities",
    icon: Puzzle,
    sections: [
      { id: "skills", labelKey: "settings.skills", icon: Sparkles },
      { id: "agents-md", labelKey: "settings.agentsMd", icon: FileText },
      { id: "custom-commands", labelKey: "settings.customCommands", icon: Code },
    ],
  },
  {
    id: "integrations",
    labelKey: "settings.groupIntegrations",
    icon: Cable,
    sections: [
      { id: "mcp", labelKey: "settings.mcp", icon: Plug },
      { id: "openclaw", labelKey: "settings.openclaw", icon: Network },
      { id: "lsp", labelKey: "settings.lsp", icon: Code2 },
      { id: "cli", labelKey: "settings.cli", icon: Terminal },
    ],
  },
] as const

// 扁平分区列表（顺序与分组一致），供路由默认值、标题解析与分区查找复用。
export const SETTINGS_SECTIONS: readonly SettingsSection[] = SETTINGS_NAV_GROUPS.flatMap(
  (group) => group.sections,
)
