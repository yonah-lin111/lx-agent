import { Check, Edit3, Plus, Save, Settings, Trash2, X } from "lucide-react"
import type React from "react"
import { forwardRef } from "react"

import type { LxTooltipPlacement } from "@/components/ui/LxTooltip"
import { LxTooltip } from "@/components/ui/LxTooltip"

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

// 图标按钮内置 Tooltip 配置。
export interface LxIconButtonTooltip {
  content: string
  placement?: LxTooltipPlacement
}

const SIZE_CONTAINER_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-6 w-6",
  medium: "h-7 w-7",
  large: "h-8 w-8",
}

const SIZE_ICON_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-3 w-3",
  medium: "h-4 w-4",
  large: "h-[18px] w-[18px]",
}

const SIZE_CHIP_ICON_CLASSES: Record<LxIconButtonSize, string> = {
  small: "h-2.5 w-2.5",
  medium: "h-3.5 w-3.5",
  large: "h-4 w-4",
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
  add: "hover:bg-white/5",
  close: "hover:bg-white/5",
  save: "hover:bg-emerald-500/10",
  confirm: "hover:bg-emerald-500/10",
  delete: "hover:bg-rose-400/10",
  edit: "hover:bg-amber-400/10",
  default: "hover:bg-white/5",
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
  iconOnly?: boolean
  preset?: LxIconButtonPreset
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
      iconOnly = true,
      preset,
      size = "medium",
      disabled,
      title,
      ...props
    },
    ref,
  ): React.JSX.Element => {
    const baseStyles =
      "flex items-center justify-center rounded-[6px] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 disabled:cursor-not-allowed disabled:opacity-35"
    const sizeStyles = iconOnly ? `${SIZE_CONTAINER_CLASSES[size]} flex-shrink-0` : ""
    const finalHoverBg = hoverBgClass ?? (preset ? PRESET_BG_CLASSES[preset] : "hover:bg-white/5")
    const finalHoverText =
      hoverTextClass ?? (preset ? PRESET_TEXT_CLASSES[preset] : "hover:text-white")
    const defaultTextClass = preset ? PRESET_DEFAULT_TEXT_CLASSES[preset] : "text-white/45"
    const highlightedStyles = `${finalHoverBg.replace("hover:", "")} ${finalHoverText.replace("hover:", "")}`
    const stateStyles = disabled
      ? highlighted
        ? highlightedStyles
        : defaultTextClass
      : highlighted
        ? highlightedStyles
        : `${defaultTextClass} ${finalHoverBg} ${finalHoverText}`

    let renderContent = children
    const PresetIcon = preset ? PRESET_ICONS[preset] : null

    if (PresetIcon && !iconOnly && children) {
      renderContent = (
        <>
          <PresetIcon className={`${SIZE_CHIP_ICON_CLASSES[size]} flex-shrink-0`} />
          {children}
        </>
      )
    } else if (!renderContent && preset) {
      renderContent = PresetIcon ? <PresetIcon className={SIZE_ICON_CLASSES[size]} /> : null
    } else if (!renderContent) {
      const DefaultIcon = PRESET_ICONS.default
      renderContent = <DefaultIcon className={SIZE_ICON_CLASSES[size]} />
    }

    const button = (
      <button
        ref={ref}
        type={type}
        className={`${baseStyles} ${sizeStyles} ${stateStyles} ${className}`}
        disabled={disabled}
        {...props}
      >
        {renderContent}
      </button>
    )

    return title ? (
      <LxTooltip content={title.content} placement={title.placement}>
        {button}
      </LxTooltip>
    ) : (
      button
    )
  },
)

LxIconButton.displayName = "LxIconButton"
