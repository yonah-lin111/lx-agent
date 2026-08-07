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

export interface UiSection {
  id: string
  label: string
  icon: LucideIcon
  description: string
}

export interface UiSectionGroup {
  id: string
  label: string
  icon: LucideIcon
  sections: readonly UiSection[]
}

// UI 组件预览分组。
export const UI_SECTION_GROUPS: readonly UiSectionGroup[] = [
  {
    id: "common",
    label: "Common Components",
    icon: Component,
    sections: [
      {
        id: "icon-button",
        label: "LxIconButton",
        icon: MousePointerClick,
        description: "统一渲染黑色主题下的图标按钮，提供预设、尺寸与形状",
      },
      {
        id: "checkbox",
        label: "LxCheckbox",
        icon: SquareCheck,
        description: "黑色主题复选框，支持受控选中与禁用状态",
      },
      {
        id: "input",
        label: "LxInput",
        icon: TextCursorInput,
        description: "单行输入与多行 textarea，支持前后缀、清除与密码/数字模式",
      },
      {
        id: "loading-overlay",
        label: "LxLoadingOverlay",
        icon: LoaderCircle,
        description: "在定位容器内展示通用加载遮罩，支持最短展示时间与淡出",
      },
      {
        id: "markdown",
        label: "LxMarkdown",
        icon: FileText,
        description: "Markdown 编辑器与预览，支持编辑、预览与分栏模式",
      },
      {
        id: "menu",
        label: "LxMenu",
        icon: Menu,
        description: "提供定位、关闭与过渡动画能力的通用菜单容器",
      },
      {
        id: "modal",
        label: "LxModal",
        icon: AppWindow,
        description: "支持遮罩关闭、键盘关闭的通用弹窗容器",
      },
      {
        id: "radio",
        label: "LxRadio",
        icon: CircleDot,
        description: "黑色主题单选组，通过 LxRadioGroup 统一受控状态",
      },
      {
        id: "select",
        label: "LxSelect",
        icon: ChevronsUpDown,
        description: "黑色主题下拉选择器，支持分组、尺寸与弹出方向",
      },
      {
        id: "tag",
        label: "LxTag",
        icon: Tag,
        description: "可配置颜色、尺寸与交互的通用标签",
      },
      {
        id: "toast",
        label: "LxToast",
        icon: Bell,
        description: "全局单条消息提示，支持 success / error / warning / info",
      },
      {
        id: "tooltip",
        label: "LxTooltip",
        icon: MessageCircle,
        description: "统一提示与二次确认气泡，自动根据视口空间调整方向",
      },
    ],
  },
  {
    id: "agent",
    label: "Agent",
    icon: Bot,
    sections: [
      {
        id: "thinking",
        label: "AgentThinkingBlock",
        icon: Brain,
        description: "可折叠的 Agent 思考时间线节点，支持流式生成状态",
      },
      {
        id: "tool-call",
        label: "AgentToolCallBlock",
        icon: Wrench,
        description: "Agent 工具调用与结果的时间线步骤，支持同名调用合并",
      },
      {
        id: "mcp-call",
        label: "AgentMcpCallBlock",
        icon: Plug,
        description: "MCP 服务工具调用摘要，合并连续同名工具方法",
      },
      {
        id: "skill-call",
        label: "AgentSkillCallBlock",
        icon: WandSparkles,
        description: "Skill 加载调用摘要，仅展示 Skill 名称",
      },
      {
        id: "web-search",
        label: "AgentWebSearchBlock",
        icon: Globe,
        description: "联网搜索调用，仅展示搜索条件，失败时标注提示",
      },
      {
        id: "message-item",
        label: "AgentMessageItem",
        icon: MessageSquare,
        description: "单条 Agent / 用户消息，渲染文本、思考与工具调用块",
      },
      {
        id: "message-list",
        label: "AgentMessageList",
        icon: MessagesSquare,
        description: "Agent 消息列表、空状态欢迎页与快捷灵感推荐",
      },
      {
        id: "skeleton",
        label: "AgentMessageListSkeleton",
        icon: Loader,
        description: "会话恢复期间展示的 QA 对话骨架屏",
      },
    ],
  },
] as const

// 平铺所有组件分区。
export const UI_SECTIONS: readonly UiSection[] = UI_SECTION_GROUPS.flatMap(
  (group) => group.sections,
)
