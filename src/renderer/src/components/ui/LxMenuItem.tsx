import type React from "react"
import { forwardRef } from "react"

// 弹窗行尺寸类型。
export type LxMenuItemSize = "small" | "medium" | "large"

// 弹窗行文字对齐类型。
export type LxMenuItemAlign = "left" | "center" | "right"

// 弹窗行 ARIA 角色：option 用于 listbox，menuitemradio 用于单选菜单。
export type LxMenuItemRole = "menuitem" | "menuitemradio" | "option"

// 弹窗行属性。
export interface LxMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  active?: boolean
  danger?: boolean
  size?: LxMenuItemSize
  align?: LxMenuItemAlign
  menuRole?: LxMenuItemRole
}

// 尺寸阶梯：行高与 LxIconButton 对齐；字号 small=xs，medium/large=sm。
const SIZE_ROW_CLASSES: Record<LxMenuItemSize, string> = {
  small: "h-6 gap-1.5 px-2 text-xs",
  medium: "h-7 gap-2 px-2.5 text-sm",
  large: "h-8 gap-2 px-3 text-sm",
}

// leading 槽为纯图标位，尺寸随档位固定。
const SIZE_LEADING_CLASSES: Record<LxMenuItemSize, string> = {
  small: "h-3.5 w-3.5",
  medium: "h-4 w-4",
  large: "h-[18px] w-[18px]",
}

// 图标尺寸随档位强制：只作用于槽位直接子级 svg，调用点无需再写尺寸类。
const SIZE_ICON_CLASSES: Record<LxMenuItemSize, string> = {
  small: "[&>svg]:h-3.5 [&>svg]:w-3.5",
  medium: "[&>svg]:h-4 [&>svg]:w-4",
  large: "[&>svg]:h-[18px] [&>svg]:w-[18px]",
}

// 文字对齐：仅控制文字区，前后图标仍贴两侧。
const ALIGN_CLASSES: Record<LxMenuItemAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
}

// 状态色：选中高亮内置，危险态区分确认前后。
const STATE_CLASSES: Record<"idle" | "active" | "danger" | "dangerActive", string> = {
  idle: "text-white/70 hover:bg-white/5 hover:text-white focus-visible:outline-white/45",
  active: "bg-white/10 text-white font-medium",
  danger:
    "text-rose-400/80 hover:bg-rose-400/10 hover:text-rose-300 focus-visible:outline-rose-400/45",
  dangerActive: "bg-rose-600 text-white hover:bg-rose-500 focus-visible:outline-rose-400/45",
}

/**
 * 渲染弹窗通用行：统一下拉、菜单与提示气泡内的尺寸档位、对齐、选中与危险态。
 */
export const LxMenuItem = forwardRef<HTMLButtonElement, LxMenuItemProps>(function LxMenuItem(
  {
    children,
    leading,
    trailing,
    active = false,
    danger = false,
    size = "medium",
    align = "left",
    menuRole = "menuitem",
    className = "",
    type = "button",
    ...props
  },
  ref,
): React.JSX.Element {
  const stateClass = danger
    ? active
      ? STATE_CLASSES.dangerActive
      : STATE_CLASSES.danger
    : active
      ? STATE_CLASSES.active
      : STATE_CLASSES.idle

  return (
    <button
      type={type}
      role={menuRole}
      data-active={active ? "true" : undefined}
      aria-selected={menuRole === "option" ? active : undefined}
      aria-checked={menuRole === "menuitemradio" ? active : undefined}
      className={`lx-menu-item flex w-full cursor-pointer items-center rounded-[6px] transition-colors focus-visible:outline focus-visible:outline-2 disabled:cursor-not-allowed disabled:opacity-35 ${SIZE_ROW_CLASSES[size]} ${stateClass} ${className}`}
      {...props}
      ref={ref}
    >
      {leading ? (
        <span
          className={`flex shrink-0 items-center justify-center ${SIZE_LEADING_CLASSES[size]} ${SIZE_ICON_CLASSES[size]}`}
        >
          {leading}
        </span>
      ) : null}
      <span className={`min-w-0 flex-1 truncate whitespace-nowrap ${ALIGN_CLASSES[align]}`}>
        {children}
      </span>
      {trailing ? (
        <span
          className={`ml-auto flex shrink-0 items-center gap-1 pl-2 font-mono text-xs text-white/40 ${SIZE_ICON_CLASSES[size]}`}
        >
          {trailing}
        </span>
      ) : null}
    </button>
  )
})
