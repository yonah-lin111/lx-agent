import type { LucideIcon } from "lucide-react"
import {
  AppWindow,
  Bell,
  ChevronsUpDown,
  CircleDot,
  FileText,
  LoaderCircle,
  Menu,
  MessageCircle,
  MousePointerClick,
  SquareCheck,
  Tag,
  TextCursorInput,
} from "lucide-react"

export interface UiSection {
  id: string
  label: string
  icon: LucideIcon
  description: string
}

// UI 组件预览分区。
export const UI_SECTIONS: readonly UiSection[] = [
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
] as const
