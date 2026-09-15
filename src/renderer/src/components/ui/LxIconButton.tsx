import { Check, Edit3, Plus, Save, Settings, Trash2, X } from "lucide-react"
import type React from "react"
import { forwardRef } from "react"

import type { LxTooltipPlacement } from "@/components/ui/LxTooltip"
import { LxTooltip } from "@/components/ui/LxTooltip"
import { useTranslation } from "@/i18n"

// 图标按钮预设类型。
export type LxIconButtonPreset =
  | "add"
  | "close"
  | "save"
  | "confirm"
  | "delete"
  | "edit"
  | "default"

// 图标按钮尺寸类型。
export type LxIconButtonSize = "small" | "medium" | "large"

// 图标按钮形状类型。
export type LxIconButtonShape = "square" | "circle"

// 图标按钮外观变体：solid = 参与主题化（Minecraft 3D 底座）；ghost = 无边框/无底色，主题不得强制浮雕。
export type LxIconButtonVariant = "solid" | "ghost"

// 图标按钮内置 Tooltip 配置。
export interface LxIconButtonTooltip {
  content: React.ReactNode
  placement?: LxTooltipPlacement
  title?: string
  onConfirm?: () => void
}

const SIZE_CONTAINER_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-6 w-6",
  medium: "h-7 w-7",
  large: "h-8 w-8",
}

// 文本/芯片模式容器高度：与图标模式档位一致，调用点无需显式设置高度。
const SIZE_HEIGHT_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-6",
  medium: "h-7",
  large: "h-8",
}

const SIZE_ICON_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-3.5 w-3.5",
  medium: "h-4 w-4",
  large: "h-[18px] w-[18px]",
}

// 图标尺寸统一映射：按钮内所有 svg（预设图标、icon prop、children 图标及包裹层内的图标）按 size 档位强制尺寸；
// 该后代选择器优先级高于 svg 自带尺寸类，调用点的尺寸声明会被覆盖。尾部关闭图标单独豁免（见下）。
const SIZE_ICON_FORCE_CLASSES: Record<LxIconButtonSize, string> = {
  small: "[&_svg]:h-3.5 [&_svg]:w-3.5",
  medium: "[&_svg]:h-4 [&_svg]:w-4",
  large: "[&_svg]:h-[18px] [&_svg]:w-[18px]",
}

// 尾部关闭图标保持独立档位（对齐 LxTag），从统一映射中豁免；
// 通过关闭入口的 role=button + data-variant=ghost 定位，避免命中 ghost 变体按钮自身的图标。
const SIZE_CLOSE_ICON_FORCE_CLASSES: Record<LxIconButtonSize, string> = {
  small:
    "[&_[role=button][data-variant=ghost]_svg]:h-3 [&_[role=button][data-variant=ghost]_svg]:w-3",
  medium:
    "[&_[role=button][data-variant=ghost]_svg]:h-3 [&_[role=button][data-variant=ghost]_svg]:w-3",
  large:
    "[&_[role=button][data-variant=ghost]_svg]:h-3.5 [&_[role=button][data-variant=ghost]_svg]:w-3.5",
}

// 带文字按钮的字号：small=xs，medium/large=sm。
const SIZE_FONT_CLASSES: Record<LxIconButtonSize, string> = {
  small: "text-xs",
  medium: "text-sm",
  large: "text-sm",
}

// 尾部关闭图标尺寸：对齐 LxTag 档位。
const SIZE_CLOSE_ICON_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-3 w-3",
  medium: "h-3 w-3",
  large: "h-3.5 w-3.5",
}

const PRESET_ICONS: Record<LxIconButtonPreset, React.ComponentType<{ className?: string }>> = {
  add: Plus,
  close: X,
  save: Save,
  confirm: Check,
  delete: Trash2,
  edit: Edit3,
  default: Settings,
}

const PRESET_BG_CLASSES: Record<LxIconButtonPreset, string> = {
  add: "hover:bg-white/10",
  close: "hover:bg-white/10",
  save: "hover:bg-emerald-500/10",
  confirm: "hover:bg-emerald-500/10",
  delete: "hover:bg-rose-400/10",
  edit: "hover:bg-amber-400/10",
  default: "hover:bg-white/10",
}

const PRESET_TEXT_CLASSES: Record<LxIconButtonPreset, string> = {
  add: "hover:text-white",
  close: "hover:text-white",
  save: "hover:text-emerald-400",
  confirm: "hover:text-emerald-400",
  delete: "hover:text-rose-300",
  edit: "hover:text-amber-300",
  default: "hover:text-white",
}

const PRESET_DEFAULT_TEXT_CLASSES: Record<LxIconButtonPreset, string> = {
  add: "text-white/45",
  close: "text-white/45",
  save: "text-emerald-500/70",
  confirm: "text-emerald-500/70",
  delete: "text-rose-400/80",
  edit: "text-amber-400/80",
  default: "text-white/45",
}

// 图标按钮属性。
export interface LxIconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title"> {
  children?: React.ReactNode
  className?: string
  highlighted?: boolean
  hoverBgClass?: string
  hoverTextClass?: string
  // 覆盖 highlighted 态的背景/文字色；未提供时按 preset 取 hover 色的常态版本，缺省 bg-white/5 text-white。
  highlightBgClass?: string
  highlightTextClass?: string
  // 覆盖基础文本色；未提供时按 preset 取色，缺省 text-white/45。
  textClass?: string
  // 前置 icon：提供时渲染「icon + 文字内容」布局（容器自适应宽度、icon 与文字间留 gap）。
  icon?: React.ReactNode
  // 尾部内容：自定义 icon 或 icon 组，原样渲染，不添加边框/底色。
  suffix?: React.ReactNode
  // 尾部关闭回调；点击关闭阻止冒泡，不触发主 onClick。
  onClose?: () => void
  // 是否二次确认后关闭，默认为 true。
  confirmClose?: boolean
  // 二次确认提示内容；未提供时使用 common.confirmDelete。
  closeTooltipContent?: React.ReactNode
  iconOnly?: boolean
  // 是否显示悬停背景颜色，默认为显示。
  showHoverBg?: boolean
  preset?: LxIconButtonPreset
  shape?: LxIconButtonShape
  // 外观变体：ghost 时不带边框/底色，主题不得强制浮雕。默认 solid。
  variant?: LxIconButtonVariant
  size?: LxIconButtonSize
  // 内置 Tooltip 配置。
  title?: LxIconButtonTooltip
}

/**
 * 统一渲染黑色主题下的图标按钮，并提供明确的悬停、聚焦与禁用状态。
 */
export const LxIconButton = forwardRef<HTMLButtonElement, LxIconButtonProps>(
  (
    {
      children,
      className = "",
      type = "button",
      highlighted = false,
      hoverBgClass,
      hoverTextClass,
      highlightBgClass,
      highlightTextClass,
      textClass,
      icon,
      suffix,
      onClose,
      confirmClose = true,
      closeTooltipContent,
      iconOnly = true,
      preset,
      shape = "square",
      variant = "solid",
      showHoverBg = true,
      size = "medium",
      disabled,
      title,
      ...props
    },
    ref,
  ): React.JSX.Element => {
    const { t } = useTranslation()
    // 尾部内容存在时按芯片模式渲染：容器自适应宽度、字号随尺寸档位。
    const hasSuffix = suffix != null || onClose != null
    // icon + 文字布局：icon 提供且 children 非空时容器自适应宽度、icon 与文字 gap。
    const hasIconAndLabel = icon != null && children != null
    const baseStyles =
      "flex items-center justify-center transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-35"
    const shapeStyles = shape === "circle" ? "rounded-full" : "rounded-[6px]"
    const sizeStyles =
      iconOnly && !hasIconAndLabel && !hasSuffix
        ? `${SIZE_CONTAINER_CLASSES[size]} flex-shrink-0`
        : `${SIZE_HEIGHT_CLASSES[size]} ${SIZE_FONT_CLASSES[size]}`
    const finalHoverBg = showHoverBg
      ? (hoverBgClass ?? (preset ? PRESET_BG_CLASSES[preset] : "hover:bg-white/10"))
      : ""
    const finalHoverText =
      hoverTextClass ?? (preset ? PRESET_TEXT_CLASSES[preset] : "hover:text-white")
    const defaultTextClass =
      textClass ?? (preset ? PRESET_DEFAULT_TEXT_CLASSES[preset] : "text-white/45")
    const highlightedStyles =
      highlightBgClass || highlightTextClass
        ? `${highlightBgClass ?? ""} ${highlightTextClass ?? ""}`.trim()
        : preset
          ? `${finalHoverBg.replace("hover:", "")} ${finalHoverText.replace("hover:", "")}`.trim()
          : "bg-white/5 text-white"
    const stateStyles = disabled
      ? highlighted
        ? highlightedStyles
        : defaultTextClass
      : highlighted
        ? highlightedStyles
        : `${defaultTextClass} ${finalHoverBg} ${finalHoverText}`

    let renderContent = children
    const PresetIcon = preset ? PRESET_ICONS[preset] : null

    if (icon != null) {
      renderContent = (
        <>
          {icon}
          {children}
        </>
      )
    } else if (PresetIcon && !iconOnly && children) {
      renderContent = (
        <>
          <PresetIcon className={`${SIZE_ICON_CLASSES[size]} flex-shrink-0`} />
          {children}
        </>
      )
    } else if (!renderContent && preset) {
      renderContent = PresetIcon ? <PresetIcon className={SIZE_ICON_CLASSES[size]} /> : null
    } else if (!renderContent) {
      const DefaultIcon = PRESET_ICONS.default
      renderContent = <DefaultIcon className={SIZE_ICON_CLASSES[size]} />
    }

    // 尾部关闭入口：关闭图标直接渲染，主题不得为其追加边框（data-variant=ghost）。
    const resolvedCloseTooltip = closeTooltipContent ?? t("common.confirmDelete")
    const renderCloseIcon = (handleClose: () => void): React.ReactNode => (
      <span
        aria-label={t("common.close")}
        data-variant="ghost"
        className="flex cursor-pointer items-center justify-center text-current opacity-60 transition-all hover:text-rose-400 hover:opacity-100"
        role="button"
        onClick={(event) => {
          event.stopPropagation()
          handleClose()
        }}
      >
        <X className={SIZE_CLOSE_ICON_CLASSES[size]} />
      </span>
    )
    const closeEntry = onClose ? (
      confirmClose ? (
        <LxTooltip
          hover={{ content: t("common.close"), placement: "top" }}
          click={{ content: resolvedCloseTooltip, placement: "top", onConfirm: onClose }}
        >
          {renderCloseIcon(() => {})}
        </LxTooltip>
      ) : (
        <LxTooltip hover={{ content: resolvedCloseTooltip, placement: "top" }}>
          {renderCloseIcon(onClose)}
        </LxTooltip>
      )
    ) : null

    if (hasSuffix) {
      renderContent = (
        <>
          {renderContent}
          {suffix}
          {closeEntry}
        </>
      )
    }

    const button = (
      <button
        ref={ref}
        type={type}
        data-highlighted={highlighted ? "true" : undefined}
        data-variant={variant}
        className={`${baseStyles} ${hasIconAndLabel || hasSuffix ? "gap-1.5" : ""} ${shapeStyles} ${sizeStyles} ${SIZE_ICON_FORCE_CLASSES[size]} ${SIZE_CLOSE_ICON_FORCE_CLASSES[size]} ${stateStyles} ${className}`}
        disabled={disabled}
        {...props}
      >
        {renderContent}
      </button>
    )

    return title ? (
      <LxTooltip
        content={title.content}
        placement={title.placement}
        title={title.title}
        onConfirm={title.onConfirm}
      >
        {button}
      </LxTooltip>
    ) : (
      button
    )
  },
)

LxIconButton.displayName = "LxIconButton"
