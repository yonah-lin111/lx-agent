import type { LucideIcon } from "lucide-react"
import {
  AppWindow,
  Bell,
  Bot,
  Brain,
  ChevronsUpDown,
  CircleDot,
  Component,
  FileText,
  Globe,
  Loader,
  LoaderCircle,
  Menu,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  MousePointerClick,
  Plug,
  SquareCheck,
  Tag,
  TextCursorInput,
  WandSparkles,
  Wrench,
} from "lucide-react"
import type { TranslationKey } from "@/i18n"

export interface UiSection {
  id: string
  label: string
  icon: LucideIcon
  descriptionKey: TranslationKey
}

export interface UiSectionGroup {
  id: string
  labelKey: TranslationKey
  icon: LucideIcon
  sections: readonly UiSection[]
}

// UI 组件预览分组。
export const UI_SECTION_GROUPS: readonly UiSectionGroup[] = [
  {
    id: "common",
    labelKey: "uiPreview.groups.common",
    icon: Component,
    sections: [
      {
        id: "icon-button",
        label: "LxIconButton",
        icon: MousePointerClick,
        descriptionKey: "uiPreview.sections.iconButton",
      },
      {
        id: "checkbox",
        label: "LxCheckbox",
        icon: SquareCheck,
        descriptionKey: "uiPreview.sections.checkbox",
      },
      {
        id: "input",
        label: "LxInput",
        icon: TextCursorInput,
        descriptionKey: "uiPreview.sections.input",
      },
      {
        id: "loading-overlay",
        label: "LxLoadingOverlay",
        icon: LoaderCircle,
        descriptionKey: "uiPreview.sections.loadingOverlay",
      },
      {
        id: "markdown",
        label: "LxMarkdown",
        icon: FileText,
        descriptionKey: "uiPreview.sections.markdown",
      },
      {
        id: "menu",
        label: "LxMenu",
        icon: Menu,
        descriptionKey: "uiPreview.sections.menu",
      },
      {
        id: "modal",
        label: "LxModal",
        icon: AppWindow,
        descriptionKey: "uiPreview.sections.modal",
      },
      {
        id: "radio",
        label: "LxRadio",
        icon: CircleDot,
        descriptionKey: "uiPreview.sections.radio",
      },
      {
        id: "select",
        label: "LxSelect",
        icon: ChevronsUpDown,
        descriptionKey: "uiPreview.sections.select",
      },
      {
        id: "tag",
        label: "LxTag",
        icon: Tag,
        descriptionKey: "uiPreview.sections.tag",
      },
      {
        id: "toast",
        label: "LxToast",
        icon: Bell,
        descriptionKey: "uiPreview.sections.toast",
      },
      {
        id: "tooltip",
        label: "LxTooltip",
        icon: MessageCircle,
        descriptionKey: "uiPreview.sections.tooltip",
      },
    ],
  },
  {
    id: "agent",
    labelKey: "uiPreview.groups.agent",
    icon: Bot,
    sections: [
      {
        id: "thinking",
        label: "AgentThinkingBlock",
        icon: Brain,
        descriptionKey: "uiPreview.sections.thinking",
      },
      {
        id: "tool-call",
        label: "AgentToolCallBlock",
        icon: Wrench,
        descriptionKey: "uiPreview.sections.toolCall",
      },
      {
        id: "mcp-call",
        label: "AgentMcpCallBlock",
        icon: Plug,
        descriptionKey: "uiPreview.sections.mcpCall",
      },
      {
        id: "skill-call",
        label: "AgentSkillCallBlock",
        icon: WandSparkles,
        descriptionKey: "uiPreview.sections.skillCall",
      },
      {
        id: "web-search",
        label: "AgentWebSearchBlock",
        icon: Globe,
        descriptionKey: "uiPreview.sections.webSearch",
      },
      {
        id: "message-item",
        label: "AgentMessageItem",
        icon: MessageSquare,
        descriptionKey: "uiPreview.sections.messageItem",
      },
      {
        id: "message-list",
        label: "AgentMessageList",
        icon: MessagesSquare,
        descriptionKey: "uiPreview.sections.messageList",
      },
      {
        id: "skeleton",
        label: "AgentMessageListSkeleton",
        icon: Loader,
        descriptionKey: "uiPreview.sections.skeleton",
      },
    ],
  },
] as const

// 平铺所有组件分区。
export const UI_SECTIONS: readonly UiSection[] = UI_SECTION_GROUPS.flatMap(
  (group) => group.sections,
)
